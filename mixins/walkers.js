var walk = require('../lib/walk.js');
var modes = require('../lib/modes.js');

module.exports = function (repo) {
  repo.logWalk = logWalk;   // (hash-ish) => stream<commit>
  repo.treeWalk = treeWalk; // (treeHash) => stream<object>
};

function logWalk(hashish, callback) {
  if (!callback) return logWalk.bind(this, hashish);
  var last, seen = {};
  var repo = this;
  return repo.readRef("shallow", onShallow);

  function onShallow(err, shallow) {
    last = shallow;
    resolveHashish(repo, hashish, onHash);

  }

  function onHash(err, hash) {
    if (err) return callback(err);
    return repo.loadAs("commit", hash, onLoad);
  }

  function onLoad(err, commit, hash) {
    if (commit === undefined) return callback(err);
    commit.hash = hash;
    seen[hash] = true;
    return callback(null, walk(commit, scan, loadKey, compare));
  }

  function scan(commit) {
    if (last === commit) return [];
    return commit.parents.filter(function (hash) {
      return !seen[hash];
    });
  }

  function loadKey(hash, callback) {
    return repo.loadAs("commit", hash, function (err, commit) {
      if (err) return callback(err);
      commit.hash = hash;
      if (hash === last) commit.last = true;
      return callback(null, commit);
    });
  }

}

function compare(commit, other) {
  return commit.author.date < other.author.date;
}

function treeWalk(hash, callback) {
  if (!callback) return treeWalk.bind(this, hash);
  var repo = this;
  return repo.loadAs("tree", hash, onTree);

  function onTree(err, body, hash) {
    if (!body) return callback(err || new Error("Missing tree " + hash));
    var tree = {
      mode: modes.tree,
      hash: hash,
      body: body,
      path: "/"
    };
    return callback(null, walk(tree, treeScan, treeLoadKey, treeCompare));
  }

  function treeLoadKey(entry, callback) {
    if (entry.mode !== modes.tree) return callback(null, entry);
    var type = modes.toType(entry.mode);
    return repo.loadAs(type, entry.hash, function (err, body) {
      if (err) return callback(err);
      entry.body = body;
      return callback(null, entry);
    });
  }

}

function treeScan(object) {
  if (object.mode !== modes.tree) return [];
  var tree = object.body;
  return Object.keys(tree).map(function (name) {
    var entry = tree[name];
    var path = object.path + name;
    if (entry.mode === modes.tree) path += "/";
    return {
      mode: entry.mode,
      hash: entry.hash,
      path: path
    };
  });
}

function treeCompare(first, second) {
  return first.path < second.path;
}

function resolveHashish(repo, hashish, callback) {
  if (/^[0-9a-f]{40}$/.test(hashish)) {
    return callback(null, hashish);
  }
  repo.readRef(hashish, function (err, hash) {
    if (!hash) return callback(err || new Error("Bad ref " + hashish));
    callback(null, hash);
  });
}
