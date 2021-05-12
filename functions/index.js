const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

async function deleteOldRooms(eventId) {
    try {
        await admin.firestore().collection('events').doc(eventId).collection('rooms').listDocuments().then(val => {
            val.map((val) => {
                val.delete()
            })
        });
    } catch (err) {
        console.error(err);
    }
}

async function getQuestions(eventId) {
    const snapshot = await admin.firestore().collection('events').doc(eventId).get();
    return snapshot.data().questions;
}

async function getUsers(eventId) {
    const snapshot = await admin.firestore().collection('events').doc(eventId).collection('users').where("userLeft", "==", false).get();
    let eventUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    eventUsers.forEach(x => {
        if (!x.usersSpokenTo) x.usersSpokenTo = [];
        x.usersRoom = null;
    });
    let userTypeA = eventUsers.filter(x => x.userType == "A");
    let userTypeB = eventUsers.filter(x => x.userType == "B");
    return [userTypeA, userTypeB];
}

function calculateScore(questions, users) {
    let score = 0;
    for(let i = 0; i < questions.length; i++) {
        let q = questions[i];
        if(q.type == 'single') {
            if(users[0].answers[i][0] == users[1].answers[i][0]) score+= q.priority;
            else score += 0;
        }
        else if(q.type == 'multiple') {
            score += _.intersection(users[0].answers[i], users[1].answers[i]).length * q.priority / q.answers.length;
        }
    }
    return score;
}

exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    let eventId = req.query.eventId;
    deleteOldRooms(eventId);
    let questions = await getQuestions(eventId);
    let [userTypeA, userTypeB] = await getUsers(eventId);
    let scoreList = [];
    for(userA of userTypeA) {
        for(userB of userTypeB) {
            scoreList.push({
                userA,
                userB,
                score: calculateScore(questions, [userA, userB])
            })
        }
    }
    res.send(scoreList.sort((a,b) => b.score - a.score));
    // for(pickedUserA of userTypeA) {
    //     let bestB = {
    //         user: null,
    //         score: -1
    //     };
    //     for(userB of userTypeB) {
    //         let score = calculateScore(questions, [pickedUserA, userB]);
    //         console.log(score)
    //         if(score > bestB.score) bestB = {
    //             user : userB,
    //             score
    //         }
    //     }
    //     let bestA = {
    //         user : null,
    //         score: -1
    //     }
    //     for(userA of userTypeA) {
    //         let score = calculateScore(questions, [bestB.user, userA]);
    //         if(score > bestA.score) bestA = {
    //             user: userA,
    //             score
    //         }
    //     }
    //     console.log(bestB, bestA)
    // }
});

exports.addDummyUsers = require('./addDummyUsers');