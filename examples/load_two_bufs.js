#!/usr/bin/env node
var async = require('async')
  , fs = require('fs')
  , BlockFile = require('..')
  , Handle = BlockFile.Handle
  , data_fn = "my-data.bf"
  , hdls_fn = "my-data-hdls.json"
  , hdls = []

var hdlStrs = JSON.parse( fs.readFileSync(hdls_fn) )
hdlStrs.forEach(function(hdlStr,i){
  var hdl = Handle.fromString( hdlStr )
  hdls.push(hdl)
})


BlockFile.open(data_fn, function(err, bf){
  if (err) throw err

  var data = []
  async.eachSeries(
    hdls
  , function(hdl, next){
      bf.load(hdl, function(err, buf, hdl_){
        if (err) { next(err); return }
        data.push([buf, hdl_])
        next()
      })
    }
  , function(err){
      if (err) throw err
      for (var i=0; i<data.length; i+=1) {
        var buf = data[i][0]
          , hdl = data[i][1]
          , len = buf.readUInt16BE(0)
          , str = buf.toString('utf8', 2, len+2)

        console.log("\nhdl = %s", hdl)
        console.log("content = %s", str)
      }
    }
  )

})