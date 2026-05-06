// ── Bug B7: TypeError — null dereference ────────────────────────────────────
// Accesses a property on null, common real-world crash.
function getUserName(user) {
  return user.profile.name;
}

const userData = null;
console.log(getUserName(userData));
