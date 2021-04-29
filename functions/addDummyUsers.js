const functions = require("firebase-functions");
const admin = require('firebase-admin');
let users = require('./data.json');
module.exports = functions.https.onRequest(async (req, res) => {
    let eventId = 'test3';
    for(user of users) {
        let docId = user.id;
        delete user.id;
        await admin.firestore().collection('events').doc(eventId).collection('users').doc(docId).set(user);
    }
    res.send('Done');
});