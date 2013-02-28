/* global describe it */

var Handle = require('../lib/handle')
  , BlockFile = require('../lib/block_file')
  , utils = require('../lib/utils')
  , u = require('lodash')
  , assert = require('assert')
  , expect = require('chai').expect
  , log = console.log
  , format = require('util').format
  , sprintf = require('printf')
  , printf = require('../lib/utils').printf
  , eprintf = require('../lib/utils').eprintf

var filename ='test.bf'
  , err, stat

try {
  stat = fs.statSync(filename)
}
catch (x) {
  err = x
}

if (stat) {
  BlockFile.printf("\nHERE\n")
  BlockFile.printf("\nHERE\n")
  fs.unlinkSync(filename)
}

describe("BlockFile", function(){

  describe("BlockFile.create()", function(){

    it("should instantiate a BlockFile object", function(done){
      BlockFile.create(filename, function(err, bf){
        if (err) {
          done(err)
          return
        }

        done(bf instanceof BlockFile)
      })
    })

  })

})