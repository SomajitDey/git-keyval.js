// Ref: https://github.com/creationix/js-git/blob/master/lib/object-codec.js
// Ref: https://github.com/creationix/js-git/blob/master/lib/modes.js
// Ref: https://github.com/creationix/bodec/blob/master/bodec-browser.js

import { textToBytes, hexToBytes, bytesToText } from './conversions.js';
import { hash } from './crypto.js';

// Ref: https://stackoverflow.com/a/49129872
function mergeByteArrays (bytesLead, bytesTrail) {
  const merged = new Uint8Array(bytesLead.length + bytesTrail.length);
  merged.set(bytesLead);
  merged.set(bytesTrail, bytesLead.length);
  return merged;
}

async function gitHash(bytesArray, type='blob', algo='SHA-1'){
  const headerBytes = textToBytes(`${type} ${bytesArray.length}\0`);
  const mergedBytesArray = mergeByteArrays(headerBytes, bytesArray);
  return hash(mergedBytesArray, algo);
}

export async function blobHash (txtContent) {
  return gitHash(textToBytes(txtContent));
}

// Ref: https://github.com/creationix/js-git/blob/master/lib/modes.js
const modes = {
  tree: '40000',
  blob: '100644',
  file: '100644',
  exec: '100755',
  sym: '120000',
  commit: '160000'
}

// Brief: Called by encodeTree() below
// Ref: https://github.com/creationix/js-git/blob/master/lib/object-codec.js
function treeMap(key) {
  var entry = this[key]; // this refers to the second argument of map() in the caller
  return {
    name: key,
    mode: modes[entry.type],
    hash: entry.hash
  };
}

// Brief: Sort files (blobs) or directories (sub-trees) in a tree by their names
// Ref: https://github.com/creationix/js-git/blob/master/lib/object-codec.js
function treeSort(a, b) {
  let aa = (a.mode === modes.tree) ? a.name + "/" : a.name;
  let bb = (b.mode === modes.tree) ? b.name + "/" : b.name;
  return aa > bb ? 1 : aa < bb ? -1 : 0;
}

// Params: entries <object> Schema: { name as <string>: { type: <string>, hash: hex<string> }, ... }
// For allowed types, see keys in modes object above. Directory names don't have trailing slash.
// Example params:
// { 
//   "file.txt": { 
//     type: "blob", hash: "416804e55ec25359360c5cd0088424da5ac522b9"
//   },
//   "sub-dir": {
//     type: "tree", hash: "6b455df2c7121a4f23578ca35cdbdf5089e35b8f"
//   }
// }
// Returns: hex <string>
// Ref: https://github.com/creationix/js-git/blob/master/lib/object-codec.js
export async function treeHash(entries) {
  // Turn entries object to a sorted array, with types replaced by modes
  const entriesArray = Object.keys(entries).map(treeMap, entries).sort(treeSort);
  const tree = entriesArray.reduce((accumulator, entry) => {
    console.log(hexToBytes(entry.hash).length);
    console.log(hexToBytes(entry.hash));
    const merged = mergeByteArrays(textToBytes(`${entry.mode} ${entry.name}\0`), hexToBytes(entry.hash));
    return mergeByteArrays(accumulator, merged);
  }, new Uint8Array(0));
  console.log(tree);
  return gitHash(tree, 'tree');
}

// Params: date <Date>
// Returns: <string>
// Ref: https://github.com/creationix/js-git/blob/master/lib/object-codec.js
function formatDate(date) {
  const seconds = Math.floor(date.getTime() / 1000);
  const offset = date.getTimezoneOffset();
  const offsetAbs = Math.abs(offset);
  const offsetPrefix = (offset > 0) ? '-' : '+';
  const offsetHrs = Math.floor(offsetAbs / 60).toString().padStart(2, '0');
  const offsetMins = Math.floor(offsetAbs % 60).toString().padStart(2, '0');
  return `${seconds} ${offsetPrefix}${offsetHrs}${offsetMins}`;
}

function formatPerson({ name, email, date }) {
  const gitDate = date instanceof Date ? formatDate(date) : date;
  return `${name} <${email}> ${gitDate}`;
}

// author | committer schema: { name, email, date }
export async function commitHash({ treeHash, parentCommitHashes, message, author, committer }) {
  let commitContent;
  commitContent = parentCommitHashes.reduce((accumulator, parentCommitHash) => {
    return `${accumulator}\nparent ${parentCommitHash}`;
  }, `tree ${treeHash}`);
  commitContent += `\nauthor ${formatPerson(author)}`;
  commitContent += `\ncommitter ${formatPerson(committer)}`;
  commitContent += `\n\n${message ? message + '\n' : ''}`; // Add linefeed to message, if non-empty
  console.log(commitContent);
  return gitHash(textToBytes(commitContent), 'commit');
}

// object schema: { hash, type }
// tagger schema: { name, email, date }
export async function annotatedTagHash ({ object, tag, tagger, message }) {
  let annotatedTagContent = `object ${object.hash}`;
  annotatedTagContent += `\ntype ${object.type}`;
  annotatedTagContent += `\ntag ${tag}`;
  annotatedTagContent += `\ntagger ${formatPerson(tagger)}`;
  annotatedTagContent += `\n\n${message}\n`; // Add linefeed to message
  console.log(annotatedTagContent);
  return gitHash(textToBytes(annotatedTagContent), 'tag');;
}

// Tests
const treeOID = '6b455df2c7121a4f23578ca35cdbdf5089e35b8f';
const entries = {
  ".gitignore": {
     type: "blob", hash: "c2658d7d1b31848c3b71960543cb0368e56cd4c7"
   },
  "LICENSE": {
     type: "blob", hash: "ff6bd914de60ddd61b72600de4c50cafd14a16a5"
   },
  "README.md": {
     type: "blob", hash: "7bedddc70e910ac884ce12f51e461b0ba9a0e1e4"
   },
  "implementation.md": {
     type: "blob", hash: "7b4e7b68909921715a7e1851fe9b7f533cb045db"
   },
  "package-lock.json": {
     type: "blob", hash: "d82357be0a391739abec53d01e74315b4be6e171"
   },
  "package.json": {
     type: "blob", hash: "e55a9b7f8a8c6fe2810446d46594e4bfb43276b5"
   },
  "src": {
     type: "tree", hash: "3107a19614d70e58c4a4b7fa8d183bc9725d5fe4"
   },
}
console.log(await treeHash(entries), treeOID);
const blobOID = 'bd9dbf5aae1a3862dd1526723246b20206e5fc37';
console.log(await blobHash('what is up, doc?'), blobOID);

console.log( await commitHash({
  treeHash: 'cf0c2fd8ac653287b3bc1a8f988a580a8f512703',
  parentCommitHashes: ['4550780e201f452725b2a06f42a74ade28a89db4'],
  author: {
    name: 'Somajit Dey',
    email: '73181168+SomajitDey@users.noreply.github.com',
    date: '1744389816 +0530'
  },
  committer: {
    name: 'Somajit Dey',
    email: '73181168+SomajitDey@users.noreply.github.com',
    date: '1744389816 +0530'
  },
  message: 'hi there'
}), 'e9ace96e2ca6a2186a0c8a65b1b925f79a6d2ad2');

console.log( await annotatedTagHash({
  object: { hash: 'd9ecde7f619917f2c0fb88e74ddf35bac4e6ec40', type: 'commit' },
  tagger: {
    name: 'Somajit Dey',
    email: '73181168+SomajitDey@users.noreply.github.com',
    date: '1744395850 +0530'
  },
  message: 'Hello\nthere',
  tag: 'annotated'
}), '5a0e776cd195b704188508dbd54146f06a2994ec');
