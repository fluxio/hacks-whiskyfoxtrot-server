/* global $, URL */

function flashAndEnableButton(btn, text, restoreText) {
    btn.empty();
    btn.append(document.createTextNode(text));
    window.setTimeout(function() {
        btn.empty();
        btn.append(document.createTextNode(restoreText));
        btn.attr('disabled', false);
    }, 3000);
}

function createMailboxHandler(evt) {
    var prjid = evt.data.prjid;
    var keyid = evt.data.keyid;
    var target = $(evt.target);
    target.attr('disabled', true);
    $.ajax({
        url: '/my/p/mailbox/' + prjid + '/' + keyid,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            lifetimeMillis: 1000 * 60 * 60 * 8
        }),
        dataType: 'json',
        error: function(err) {
            console.log(err);
            flashAndEnableButton(target, 'error!', 'new mailbox');
        },
        success: function(data, textStats, xhr) {
            flashAndEnableButton(target, 'success', 'new mailbox');
            reloadMailboxList();
        }
    });
}

function deleteMailboxHandler(evt) {
    var mboxid = evt.data.mboxid;
    var target = $(evt.target);
    target.attr('disabled', true);
    $.ajax({
        url: '/mailbox/' + mboxid,
        method: 'DELETE',
        error: function(err) {
            console.log(err);
            flashAndEnableButton(target, 'error!', 'expire now');
        },
        success: function(data, textStats, xhr) {
            flashAndEnableButton(target, 'success!', '');
            reloadMailboxList();
        }
    });
}

function postMailboxHandler(evt) {
    console.log(evt);
    var mboxid = evt.data.mboxid;
    var input = evt.data.input.value;
    var target = $(evt.target);
    target.attr('disabled', true);
    try {
        JSON.parse(input);
    } catch (exc) {
        flashAndEnableButton(target, 'bad JSON!', 'post input');
        return;
    }
    $.ajax({
        url: '/mailbox/' + mboxid,
        method: 'POST',
        contentType: 'application/json',
        data: input,
        dataType: 'json',
        error: function(err) {
            console.log(err);
            flashAndEnableButton(target, 'error!', 'post input');
        },
        success: function(data, textStatus, xhr) {
            flashAndEnableButton(target, 'success!', 'post input');
        }
    });
}

function loadKeys(prjid, wrap) {
    $.ajax({
        url: '/my/p/' + prjid + '/keys',
        dataType: 'json',
        error: function(err) {
            wrap.empty();
            wrap.append(document.createTextNode('load error: ' + JSON.stringify(err)));
        },
        success: function(data, textStats, xhr) {
            var ul = $(document.createElement('ul'));
            ul.attr('class', 'keyList');
            for (var i = 0; i < data.entities.length; i++) {
                var ent = data.entities[i];
                var li = $(document.createElement('li'));

                var buttonCreate = $(document.createElement('button'));
                buttonCreate.bind('click',
                                  {prjid: prjid, keyid: ent.id},
                                  createMailboxHandler);
                buttonCreate.append(document.createTextNode('new mailbox'));
                li.append(buttonCreate);

                var keyLabel = $(document.createElement('span'));
                keyLabel.attr('class', 'keyid');
                keyLabel.append(document.createTextNode(ent.id));
                li.append(keyLabel);

                var label = $(document.createTextNode(ent.label + ' @ ' + ent.timeUpdated));
                li.append(label);

                ul.append(li);
            }

            wrap.empty();
            wrap.append(ul);
        }
    });
}

function reloadProjectList() {
    var wrap = $('#projectListWrap');
    wrap.empty();
    wrap.append(document.createTextNode('Loading...'));
    $.ajax({
        url: '/my/projects',
        dataType: 'json',
        error: function(err) {
            wrap.empty();
            wrap.append(document.createTextNode('load error: ' + JSON.stringify(err)));
        },
        success: function(data, textStatus, xhr) {
            wrap.empty();
            var table = $(document.createElement('table'));
            table.attr('class', 'projectList');
            data.entities.sort(function(a, b) {
                return a.timeUpdated > b.timeUpdated ? -1 :
                    (a.timeUpdated == b.timeUpdated ? 0 :
                     1);
            });

            // TODO(keunwoo): support >3 projects
            for (var i = 0; i < Math.min(data.entities.length, 3); i++) {
                var ent = data.entities[i];
                var tr = $(document.createElement('tr'));

                var tdName = $(document.createElement('td'));
                var a = $(document.createElement('a'));
                a.attr('href', 'https://flux.io/p/' + ent.id);
                a.append($(document.createTextNode(ent.name)));
                tdName.append(a);
                tr.append(tdName);

                var tdKeys = $(document.createElement('td'));
                tdKeys.append(document.createTextNode('loading keys...'));
                loadKeys(ent.id, tdKeys);
                tr.append(tdKeys);

                table.append(tr);
            }

            wrap.append(table);

            if (data.entities.length > 3) {
                var overflow = $(document.createElement('p'));
                overflow.append(document.createTextNode(
                    '(only showing ' + 3 + ' projects with most recently updated project metadata)'));
                wrap.append(overflow);
            }
        }
    });
}

function reloadMailboxList() {
    var wrap = $('#mailboxListWrap');
    wrap.empty();
    wrap.append(document.createTextNode('Loading...'));
    $.ajax({
        url: '/my/mailboxes',
        dataType: 'json',
        error: function(err) {
            wrap.empty();
            wrap.append(document.createTextNode('load error: ' + JSON.stringify(err)));
        },
        success: function(data, textStatus, xhr) {
            wrap.empty();

            if (data.length === 0) {
                wrap.append(document.createTextNode('(no mailboxes yet)'));
                return;
            }

            for (var i = 0; i < data.length; i++) {
                var ent = data[i];
                var div = $(document.createElement('div'));
                div.attr('class', 'mailboxListing');

                var keyId = $(document.createElement('span'));
                keyId.attr('class', 'keyid');
                keyId.append(document.createTextNode(ent.keyid));
                div.append(keyId);

                var path = '/mailbox/' + ent.mboxid;
                var url = new URL(path, document.location).toString();
                div.append(document.createTextNode(url));

                var qrDiv = $(document.createElement('div'));
                qrDiv.attr('class', 'mailboxQR');
                var qrLink = $(document.createElement('a'));
                qrLink.attr('href', '/mailbox/' + ent.mboxid + '/qr');
                qrLink.append(document.createTextNode('qr code'));
                qrDiv.append(qrLink);
                div.append(qrDiv);

                var expiresDiv = $(document.createElement('div'));
                expiresDiv.attr('class', 'mailboxExpires');
                expiresDiv.append(document.createTextNode('expires @ ' + new Date(ent.expiryMillis)));
                var deleteButton = $(document.createElement('button'));
                deleteButton.attr('class', 'deleteMailboxButton');
                deleteButton.append(document.createTextNode('expire now'));
                deleteButton.bind('click',
                                  {mboxid: ent.mboxid},
                                  deleteMailboxHandler);
                expiresDiv.append(deleteButton);
                div.append(expiresDiv);

                var postDiv = $(document.createElement('div'));
                postDiv.attr('class', 'mailboxPost');
                var postInput = $(document.createElement('input'));
                postInput.attr('class', 'mailboxPostInput');
                postDiv.append(postInput);
                var postButton = $(document.createElement('button'));
                postButton.append(document.createTextNode('post input'));
                postButton.bind('click',
                                {mboxid: ent.mboxid, input: postInput[0]},
                                postMailboxHandler);
                postDiv.append(postButton);
                div.append(postDiv);

                wrap.append(div);
            }
        }
    });
}

function main() {
    reloadProjectList();
    reloadMailboxList();
}

main();
