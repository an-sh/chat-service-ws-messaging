'use strict'

var semver = require('semver')

// Choosing between a source ES6 syntax and a transpiled ES5.
if (semver.lt(process.version, '6.0.0')) {
  module.exports = require('./lib/Transport')
} else {
  module.exports = require('./src/Transport')
}
