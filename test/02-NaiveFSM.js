/* global describe it */

var Handle = require('../lib/handle')
  , NaiveFSM = require('../lib/fsm_naive')
  , signCRC = require('../lib/utils').signCRC
  , BLOCK_SIZE = require('../lib/constants').BLOCK_SIZE
  , u = require('lodash')
  , assert = require('chai').assert
  , expect = require('chai').expect
  , log = console.log
  , sprintf = require('printf')
  , printf = require('../lib/utils').printf
  , eprintf = require('../lib/utils').eprintf

describe("NaiveFSM", function(){
  var fsm, span, ofsm
    , buf = new Buffer(BLOCK_SIZE)

  buf.fill(0xff)
  signCRC(buf)

  describe("Constructor", function(){
    it("new NaiveFSM(buf) should return a handle", function(){
      fsm  = new NaiveFSM(buf)
      ofsm = new NaiveFSM(buf)

      assert.ok(fsm)
    })
  })

  describe("fsm.alloc then fsm.free", function(){
    var span

    describe("fsm.alloc MIN_SPANNUM", function(){
      it(".alloc()", function(){
        span = fsm.alloc(Handle.MIN_SPANNUM)

        assert.ok( u.isPlainObject(span) )
        expect(span.beg).to.a('number')
        expect(span.end).to.a('number')
      })
      it("the returned object should have o.end - o.beg === 0", function(){
        expect(span.end-span.beg).to.be.equal(0)
      })
    })

    describe("fsm.free MIN_SPANNUM", function(){
      it("fsm.free above allocated object", function(){
        fsm.free(span)
      })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 MIN_SPANNUM, then fsm.free [0,1,2]", function(){
    var span = []

    describe("fsm.alloc x3 MIN_SPANNUM", function(){
      it(".alloc() span[0..2]", function(){
        for (var i=0; i<3; i++) {
          span[i] = fsm.alloc(Handle.MIN_SPANNUM)
          u.isPlainObject(span[i])
          expect(span[i].beg).to.be.a('number')
          expect(span[i].end).to.be.a('number')
        }
      })
      //it("the returned object should have o.end - o.beg === 0", function(){
      //  expect(span.end-span.beg).to.be.equal(0)
      //})
    })

    describe("fsm.free [0,1,2]", function(){
      it("fsm.free span[0]", function(){ fsm.free(span[0]) })
      it("fsm.free span[1]", function(){ fsm.free(span[1]) })
      it("fsm.free span[2]", function(){ fsm.free(span[2]) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 MIN_SPANNUM, then fsm.free [0,2,1]", function(){
    var span = []

    describe("fsm.alloc x3 MIN_SPANNUM", function(){
      it(".alloc() span[0..2]", function(){
        for (var i=0; i<3; i++) {
          span[i] = fsm.alloc(Handle.MIN_SPANNUM)
          expect( u.isPlainObject(span[i]) ).to.equal(true)
          expect(span[i].beg).to.be.a('number')
          expect(span[i].end).to.be.a('number')
        }
      })
      it("the returned objects should have o.end - o.beg === 0", function(){
        for (var i=0; i<3; i++)
          expect(span[i].end - span[i].beg).to.be.equal(Handle.MIN_SPANNUM)
      })
      it("expect fsm.span[15].length === 2046", function(){
//        eprintf("spans[%d].length = %d\n", 15, fsm.spans[15].length)
        expect(fsm.spans[15].length).to.equal(2046)
      })
      it("expect fsm.span[14,13].length === 0", function(){
        expect(fsm.spans[14].length).to.equal(0)
        expect(fsm.spans[13].length).to.equal(0)
      })
      it("expect fsm.span[12].length === 1", function(){
        //one span of 16 blocks with three single blocks extracted
        // spanNum = 15(orig) - 3 blocks == 12
        expect(fsm.spans[12].length).to.equal(1)
      })
      it("expect fsm.span[0..11].length === 0", function(){
        for (var i=0; i<12; i++) {
          expect(fsm.spans[i].length).to.equal(0)
        }
      })
    })

    describe("fsm.free [0,2,1]", function(){
      it("fsm.free span[0]", function(){
        //first span; only one span freed; one total
        fsm.free(span[0])
        //first free span is separated from any bigger one by other two
        expect(fsm.spans[0].length).to.equal(1)
        //three blocks were pulled off 15
        // so there remains a 12 span
        expect(fsm.spans[12].length).to.equal(1)
      })
      it("fsm.free span[2]", function(){
        //third span; only one span freed; two total
        fsm.free(span[2])
        //first free span is separated from any bigger one by other two
        expect(fsm.spans[0].length).to.equal(1)
        //three blocks were pulled off 15
        // freeing the last one merges with the 12 one
        expect(fsm.spans[13].length).to.equal(1)
      })
      it("fsm.free span[1]", function(){
        //second span; should merge spans with first and thirteenth
        fsm.free(span[1])
        expect(fsm.spans[15].length).to.equal(2047)
      })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 MAX_SPANNUM, then fsm.free [0,1,2]", function(){
    var span = []

    describe("fsm.alloc x3 MAX_SPANNUM", function(){
      it(".alloc() span[0..2]", function(){
        for (var i=0; i<3; i++) {
          span[i] = fsm.alloc(Handle.MAX_SPANNUM)
          u.isPlainObject(span[i])
          expect(span[i].beg).to.be.a('number')
          expect(span[i].end).to.be.a('number')
        }
      })
      it("the returned objects should have o.end - o.beg === 15", function(){
        for (var i=0; i<3; i++)
          expect(span[i].end - span[i].beg).to.be.equal(Handle.MAX_SPANNUM)
      })
      it("expect fsm.span[15].length === 2047-3", function(){
        expect(fsm.spans[15].length).to.equal(2044)
      })
      it("expect fsm.span[0..14].length === 0", function(){
        for (var i=0; i<14; i++) expect(fsm.spans[i].length).to.equal(0)
      })
    })

    describe("fsm.free [0,1,2]", function(){
      it("fsm.free span[0]", function(){ fsm.free(span[0]) })
      it("fsm.free span[1]", function(){ fsm.free(span[1]) })
      it("fsm.free span[2]", function(){ fsm.free(span[2]) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 MAX_SPANNUM, then fsm.free [0,2,1]", function(){
    var span = []

    describe("fsm.alloc x3 MAX_SPANNUM", function(){
      it(".alloc() span[0..2]", function(){
        for (var i=0; i<3; i++) {
          span[i] = fsm.alloc(Handle.MAX_SPANNUM)
          u.isPlainObject(span[i])
          expect(span[i].beg).to.be.a('number')
          expect(span[i].end).to.be.a('number')
        }
      })
      //it("the returned object should have o.end - o.beg === 0", function(){
      //  expect(span.end-span.beg).to.be.equal(0)
      //})
    })

    describe("fsm.free [0,2,1]", function(){
      it("fsm.free span[0]", function(){ fsm.free(span[0]) })
      it("fsm.free span[2]", function(){ fsm.free(span[2]) })
      it("fsm.free span[1]", function(){ fsm.free(span[1]) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  // describe("fsm.alloc 3 & fsm.free 3 span of 3 == MAX_SPAN", function(){})
  // describe("fsm.alloc 3 & fsm.free 3 span of 3 > MAX_SPAN", function(){})
})
//    describe("", function(){
////    it("", function(){})
//    })
//    it("", function(){})
