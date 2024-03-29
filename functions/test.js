const _ = require('lodash');
let eventUsers = require('./data.json');
let initRoomId = 0;
let users = [];
let rooms = {};
eventUsers.forEach(x => {
    if (!x.usersSpokenTo) x.usersSpokenTo = [];
    x.usersRoom = null;
});
var userTypeA = eventUsers.filter(x => x.userType == "A");
var userTypeB = eventUsers.filter(x => x.userType == "B");


function createRoom(...users) {
    let roomId = 'r' + (++initRoomId);
    rooms[roomId] = users.map(x => x.id);
    users.forEach(x => x.usersRoom = roomId);
}

// Same Type Matching
function sameTypeMatching(usersArr) {
    usersArr.sort((a, b) => b.usersSpokenTo.length - a.usersSpokenTo.length);
    if (usersArr.length != 0) {
        if (usersArr.length == 1) {
            let takernUserB = usersArr.shift();
            takernUserB.usersRoom = null;
            users.push(takernUserB);
            return;
        }
        else if (usersArr.length == 3) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            let u3 = usersArr.shift();
            if(u1.usersSpokenTo.includes(u2.id) || u1.usersSpokenTo.includes(u3.id) || u2.usersSpokenTo.includes(u3.id)) {
                u1.usersRoom = null;
                u2.usersRoom = null;
                u3.usersRoom = null;
            }
            else {
                u1.usersSpokenTo.push(u2.id, u3.id);
                u2.usersSpokenTo.push(u1.id, u3.id);
                u3.usersSpokenTo.push(u1.id, u2.id);
                createRoom(u1, u2, u3);
            }
            users.push(u1, u2, u3);
            return;
        }
        else if (usersArr.length == 2) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            if (!u1.usersSpokenTo.includes(u2.id)) {
                u1.usersSpokenTo.push(u2.id);
                u2.usersSpokenTo.push(u1.id);
                createRoom(u1, u2);
                users.push(u1, u2);
            }
            else {
                u1.usersRoom = null;
                u2.usersRoom = null;
                users.push(u1, u2);
            }
            return;
        }
        else {
            let u1 = usersArr.shift();
            let u2 = usersArr.find(x => !x.usersSpokenTo.includes(u1.id));
            _.remove(usersArr, u2);
            u1.usersSpokenTo.push(u2.id);
            u2.usersSpokenTo.push(u1.id);
            createRoom(u1, u2);
            users.push(u1, u2);
            sameTypeMatching(usersArr);
        }
    }
}

// Different Type Matching
while (takenUserA = userTypeA.shift()) {
    let notSpoken = _.difference(userTypeB.map(x => x.id), takenUserA.usersSpokenTo);
    if (notSpoken.length == 0) break;
    let takenNotSpokenBId = notSpoken.shift();
    let takenUserB = userTypeB.find(x => x.id == takenNotSpokenBId);
    _.remove(userTypeB, function (c) {
        return (c.id === takenNotSpokenBId);
    });
    takenUserA.usersSpokenTo.push(takenUserB.id);
    takenUserB.usersSpokenTo.push(takenUserA.id);
    createRoom(takenUserA, takenUserB)
    users.push(takenUserA, takenUserB);
}

sameTypeMatching(userTypeA);
sameTypeMatching(userTypeB);

console.log(users);
console.log(rooms);