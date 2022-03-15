const exp = require('express');
const xenv = require('@sap/xsenv');
const hdbext = require('@sap/hdbext');
const axios = require('axios');
const app = exp();

//get HANA Cloud info with credentials
let hanasrv = xenv.getServices({ hana: { tag: 'hana' } });
let msgsrv = xenv.getServices({ "enterprise-messaging": { tag: 'enterprise-messaging' } });

//function for message push
let eventpush = async (baseuri, accesstok, body) => {
    await axios.post(baseuri, body, {
        headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accesstok}`,
            'x-qos': 1
        }
    }).then(response => {
        console.log('Queue API success');
        console.log(response);

    }).catch(err => {
        console.log('err in Queue API');
        console.log(err);
    });
};
//function for token'
let eventmeshfun = async (token, tokenurl, baseuri, body) => {
    await axios.post(tokenurl, {}, {
        headers: {
            'Authorization': `Basic ${token}`
        }
    }).then(response => {
        console.log('response trigger');
        console.log(response);//here we will get access token"
        //post message to Queue API
        eventpush(baseuri, response.data.access_token, body)
    }).catch(err => {
        console.log('err');
    });
};
//function to update HANA
let updatehana = (data, req) => {
    let element = data;
    req.db.exec('INSERT INTO "DBADMIN"."EMRECEIVE" VALUES(?,?,?)', [element.ID, element.DATA, element.Comments],
        (err) => {
            if (err) {
                console.log(err);

            }
        });

};
//function for pull request
let eventpull = async (baseuri, accesstok, req) => {
    await axios.post(baseuri, {}, {
        headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${accesstok}`,
            'x-qos': 1
        }
    }).then(response => {
        console.log('Queue API success webhook');
        console.log(response);
        //update HANA
        updatehana(response.data, req);
    }).catch(err => {
        console.log('err in Queue API webhook');
        console.log(err);
    });
};


//function for webhook
let eventpullfun = async (token, tokenurl, baseuri, req) => {
    await axios.post(tokenurl, {}, {
        headers: {
            'Authorization': `Basic ${token}`
        }
    }).then(response => {
        console.log('response trigger from Webhook');
        console.log(response);//here we will get access token"
        //post message to Queue API consumption
        eventpull(baseuri, response.data.access_token, req)
    }).catch(err => {
        console.log('err Webhook');
    });
};

//Use middleware for Cloudfoundry
app.use(hdbext.middleware(hanasrv.hana));
app.use(exp.json());
app.use(exp.urlencoded({ extended: true }));

//get data from EMSEND
app.get('/emsend', (req, res) => {
    req.db.exec('SELECT * FROM "DBADMIN"."EMRECEIVE"', (err, rows) => {
        if (err) {
            res.type('text/plain').status(500).send(err);
        };
        res.status(200).json(rows);
    });
});
//push messages to Queue
app.post('/push', (req, res) => {

    let lmessages = msgsrv['enterprise-messaging'].messaging;

    let lhttp = lmessages.filter(lmessage => lmessage.protocol[0] == 'httprest');
    let tokenurl = lhttp[0].oa2.tokenendpoint + '?grant_type=client_credentials&response_type=token';
    let baseuri = lhttp[0].uri + '/messagingrest/v1/queues/HANAQUEUE/messages';
    const username = lhttp[0].oa2.clientid;
    const password = lhttp[0].oa2.clientsecret;
    const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    eventmeshfun(token, tokenurl, baseuri, req.body);
    res.send('Data Push Done');
});
//Webhook subscription from QUEUE
app.post('/ignore', (req, res) => {
    let lmessages = msgsrv['enterprise-messaging'].messaging;

    let lhttp = lmessages.filter(lmessage => lmessage.protocol[0] == 'httprest');
    let tokenurl = lhttp[0].oa2.tokenendpoint + '?grant_type=client_credentials&response_type=token';
    let baseuri = lhttp[0].uri + '/messagingrest/v1/queues/HANAQUEUE/messages/consumption';
    const username = lhttp[0].oa2.clientid;
    const password = lhttp[0].oa2.clientsecret;
    const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    eventpullfun(token, tokenurl, baseuri, req);
    res.send('Data Pull Done');
});
////Webhook subscription from QUEUE
app.post('/pull', (req, res) => {
    let element = req.body;
    req.db.exec('INSERT INTO "DBADMIN"."EMRECEIVE" VALUES(?,?,?)', [element.ID, element.DATA, element.Comments],
        (err) => {
            if (err) {
                console.log(err);

            }
        });
   /* let element = '';
    //  res.json(req.body);
    for (let index = 0; index < req.body.length; index++) {
        element = req.body[index];
        console.log(element);
        req.db.exec('INSERT INTO "DBADMIN"."EMRECEIVE" VALUES(?,?,?)', [element.ID, element.DATA, element.Comments],
            (err) => {
                if (err) {
                    console.log(err);
                    res.type('text/plain').send(err);
                }
            });
    }*/
    res.send('Data Upload successful');
});

//send sample response
app.get('/', (req, res) => {
    res.send('API is working');
});

//send sample response of enterprise messaging
app.get('/test', (req, res) => {

    res.json(msgsrv['enterprise-messaging']);
});

const lport = process.env.PORT || 2000;
app.listen(lport);