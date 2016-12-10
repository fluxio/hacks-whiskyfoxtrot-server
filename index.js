// nodejs standard libraries
var crypto = require('crypto');
var process = require('process');

// express
var bodyParser = require('body-parser');
var express = require('express');
var session = require('express-session');

// other npm libraries
var fluxSDK = require('flux-sdk-node');

// local libs
var db = require('./db');

var config = {
    debug: process.env.NODE_ENV !== 'production',
    dbUrl: process.env.DATABASE_URL,
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

function withDBConn(cb) {
    if (config.dbUrl) {
        db.connectPG(config.dbUrl, cb);
    } else {
        db.memDB(cb);
    }
}

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
    res.render('pages/index', {
        userId: req.session && req.session.fluxCredentials && fluxUserId(req.session.fluxCredentials)
    });
});

var onInternalErr = function(res, err) {
    console.log('internal error: ' + err);
    res.status(500).send('internal error');
};

var onAccessDenied = function(res) {
    res.status(400).type('html').send('access denied; you need to <a href="/oauth">login</a>');
};

// Redirect user to login.
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

// OIDC callback endpoint.
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
            // TODO(keunwoo): Verify nonce against ID token.
            req.session.fluxCredentials = credentials;
            res.redirect('/');
        })
        .catch(next);
});

function requireSession(req, res, next) {
    if (req.session.fluxCredentials) {
        req.credentials = req.session.fluxCredentials;
        next();
    } else {
        onAccessDenied(res);
    }
}

function fluxUserId(credentials) {
    return credentials.idToken.payload.flux_id_hash;
}


var myRouter = express.Router();
myRouter.use(requireSession);

// List this user's projects.
myRouter.get('/projects', function(req, res, next) {
    sdk.getUser(req.credentials)
        .listProjects()
        .then(function(projects) {
            res.json(projects);
        })
        .catch(next);
});

// List keys for a project.
myRouter.get('/p/:prjid/keys', function(req, res, next) {
    var dt = new sdk.DataTable(req.credentials, req.params.prjid);
    dt.listCells()
        .then(function(cells) {
            res.json(cells);
        })
        .catch(next);
});

// Mint a new mailbox for project ID & key.
myRouter.post('/p/mailbox/:prjid/:keyid', function(req, res, next) {
    var lifetime = req.body.lifetime;
    if (typeof lifetime !== 'number') {
        res.status(400).send('lifetime must be a number');
        return;
    }
    var dt = new sdk.DataTable(req.credentials, req.params.prjid);
    dt.listCells()
        .then(function(cells) {
            crypto.randomBytes(24, function(err, bytes) {
                if (err) {
                    onInternalErr(res, err);
                    return;
                }
                var mboxid = mboxid.toString('hex');

                withDBConn(function(dbConn) {
                    dbConn.saveMailbox({
                        mboxid: mboxid,
                        userid: fluxUserId(req.credentials),
                        prjid: req.params.prjid,
                        keyid: req.params.keyid,
                        credentials: JSON.stringify(req.credentials),
                        expiry: Date.now() + lifetime
                    }, function(err, mboxid) {
                        if (err) {
                            onInternalErr(res, err);
                            return;
                        }
                        res.json({mailboxid: mboxid});
                    });
                });
            });
        })
        .catch(next);
});

// List this user's mailboxes.
myRouter.get('/mailboxes', function(req, res, next) {
    var userid = fluxUserId(req.credentials);
    withDBConn(function(dbConn) {
        dbConn.listMailboxes(userid, function(err, mboxes) {
            if (err) {
                onInternalErr(res, err);
                return;
            }
            res.json(mboxes);
        });
    });
});

app.use('/my', myRouter);


var mailboxRouter = express.Router();

// Get an image of the QR code for a mailbox
mailboxRouter.get('/:mboxid/qr', function(req, res, next) {
    // TODO(keunwoo): implement me
});

// Post a new value to the given mailbox.
mailboxRouter.post('/:mboxid', requireSession, function(req, res, next) {
    withDBConn(function(dbConn) {
        dbConn.getMailbox(req.params.mboxid, function(err, info) {
            if (err) {
                onInternalErr(err, res);
                return;
            }
            if (!info) {
                res.status(404).send('no such mailbox or mailbox expired');
                return;
            }
            var dt = new sdk.DataTable(info.credentials, info.prjid);
            dt.req.cell.update(req.body)
                .then(function(response) {
                    res.json(response);
                })
                .catch(next);
        });
    });
});

// Delete a mailbox.  Deleted mailboxes are tombstoned.
mailboxRouter.delete('/:mboxid', requireSession, function(req, res, next) {
    var userid = fluxUserId(req.credentials);
    withDBConn(function(dbConn) {
        dbConn.deleteMailbox(req.params.mboxid, userid, function(err) {
            if (err) {
                onInternalErr(err, res);
                return;
            }
            res.status(204).send();
        });
    });
});

app.use('/mailbox', mailboxRouter);


app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});
