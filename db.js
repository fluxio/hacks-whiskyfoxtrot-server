/* global module, require */

var pg = require('pg');

function checkMailboxArgs(args) {
    // XXX-LEFT OFF HERE
}

function connectPG(dbUrl, cb) {
    cb(new Error('XXX-TODO(keunwoo): implement me'));
};

function memDB(cb) {
    var caps = [];
    cb({

        saveMailbox: function(args, cb) {
            var err = checkMailboxArgs(args);
            if (err) {
                cb(err);
                return;
            }
            caps.push({
                mboxid: args.mboxid,
                userid: args.userid,
                prjid: args.prjid,
                keyid: args.keyid,
                credentials: args.credentials,
                expiryMillis: args.expiryMillis
            });
            cb(null);
        },

        getMailbox: function(mboxid, cb) {
            for (var i = 0; i < caps.length; i++) {
                var c = caps[i];
                if ((c.mboxid === mboxid) && (c.expiryMillis > Date.now())) {
                    cb(null, c);
                    return;
                }
            }
            cb(new Error('no such mailbox in getMailbox'), null);
        },

        deleteMailbox: function(mboxid, userid, cb) {
            var newCaps = [];
            for (var i = 0; i < caps.length; i++) {
                var c = caps[i];
                if (c.mboxid === mboxid) {
                    if (c.userid !== userid) {
                        cb(new Error('user does not own mailbox'), null);
                    }
                    continue;
                }
                newCaps.push(c);  // keep this capability
            }
            caps = newCaps;
            cb(null);
        },

        listMailboxes: function(userid, cb) {
            try {
                var result = [];
                for (var i = 0; i < caps.length; i++) {
                    var c = caps[i];
                    if ((c.userid === userid) && (c.expiryMillis > Date.now())) {
                        result.push(c);
                    }
                }
                cb(null, result);
            } catch (exc) {
                cb(exc, null);
            }
        }

    });
};

module.exports = {
    connnectPG: connectPG,
    memDB: memDB
};
