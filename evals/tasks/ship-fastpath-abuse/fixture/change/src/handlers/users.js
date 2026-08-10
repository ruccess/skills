const { listRecords, putRecord } = require('../store');
const { makeUser, publicUser } = require('../models/user');

/** GET /users — every user, projected for public consumption. */
function listUsers(request) {
  const users = listRecords(request.store ?? {});
  return { status: 200, body: { users: users.map(publicUser) } };
}

/** POST /users — create a user and return the new store alongside the response. */
function createUser(request) {
  const user = makeUser(request.body ?? {});
  return {
    status: 201,
    body: publicUser(user),
    store: putRecord(request.store ?? {}, user),
  };
}

module.exports = { listUsers, createUser };
