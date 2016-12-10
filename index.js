// nodejs standard libraries
var crypto = require('crypto');
var process = require('process');

// express
var bodyParser = require('body-parser');
var express = require('express');
var session = require('express-session');

// other npm libraries
var fluxSDK = require('flux-sdk-node');

var config = {
    debug: process.env.NODE_ENV !== 'production',
    fluxClientId: process.env.FLUX_CLIENT_ID,
    fluxClientSecret: process.env.FLUX_CLIENT_SECRET,
    fluxRedirectUri: process.env.FLUX_REDIRECT_URI,
    fluxUrl: process.env.FLUX_URL,
    port: process.env.PORT,
    sessionSecret: process.env.SESSION_SECRET
};

var sdk = new fluxSDK(config.fluxClientId, {
    fluxUrl: config.fluxUrl,
    clientSecret: config.fluxClientSecret,
    redirectUri: config.fluxRedirectUri
});

var app = express();
app.set('port', config.port);
app.set('x-powered-by', false);

// setup template file search configuration
app.use(express.static(__dirname + '/public'));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(bodyParser.json());

app.use(session({
    secret: config.sessionSecret,
    saveUninitialized: true,
    resave: true
    // TODO(keunwoo): add a session store that survives restarts
}));

app.get('/', function(req, res, next) {
    var idToken = req && req.session && req.session.fluxCredentials && req.session.fluxCredentials.idToken;
    console.log('idToken: ' + idToken);
    res.render('pages/index', {
        userId: idToken && idToken.payload && idToken.payload.flux_id_hash
    });
});

var onInternalErr = function(res, err) {
    console.log('internal error: ' + err);
    res.status(500).send('internal error');
};

app.use('/oauth', function(req, res, next) {
    crypto.randomBytes(24, function(err, nonceBytes) {
        if (err) {
            onInternalErr(res, err);
            return;
        }

        crypto.randomBytes(24, function(err, stateSeedBytes) {
            if (err) {
                onInternalErr(res, err);
                return;
            }
            req.session.nonce = nonceBytes.toString('hex');
            // TODO(keunwoo): cryptographically bind state to current session.
            req.session.state = stateSeedBytes.toString('hex');
            var authorizeUrl = sdk.getAuthorizeUrl(req.session.state, req.session.nonce);
            res.redirect(authorizeUrl);
        });
    });
});

app.use('/oauthcb', function(req, res, next) {
    var reqState;
    if (req.method === 'GET') {
        reqState = req.query.state;
    } else if (req.method === 'POST') {
        reqState = req.body.state;
    } else {
        res.status(405).send('invalid request method');
        return;
    }

    if (req.session.state !== reqState) {
        res.status(400).send('invalid oauth state');
        return;
    }

    sdk.exchangeCredentials(req.session.state, req.session.nonce, req.query)
        .then(function(credentials) {
            console.log('stashing credentials in session:');
            console.log(credentials);
            req.session.fluxCredentials = credentials;
            res.redirect('/');
        })
        .catch(next);
});

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});
