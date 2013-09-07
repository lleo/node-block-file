#!/usr/bin/env node
var async = require('async')
  , fs = require('fs')
  , BlockFile = require('..')
  , hdls
  , data_fn = "my-data.bf"
  , hdls_fn = "my-data-hdls.json"
  , str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam mauris nisi, a venenatis libero. Pellentesque lacinia enim at mi cursus at eleifend ante varius. Pellentesque pretium ligula ut purus dictum condimentum. Nulla facilisi. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vivamus quis enim mauris. Aliquam nunc massa, rhoncus sit amet elementum ut, congue ut libero. Nunc eget turpis augue. Curabitur venenatis, dolor in accumsan lobortis, nisi mauris iaculis purus, vitae pharetra purus sem id felis. Morbi vitae felis nibh, sit amet fermentum purus. Vestibulum scelerisque pellentesque ante sed posuere. Fusce sit amet ullamcorper sem.\n\nEtiam vehicula facilisis diam sed iaculis. Sed ac augue id nisl faucibus cursus eu ac dolor. Nunc sed nunc eu felis iaculis varius vitae sed lorem. In vitae ligula nunc. Fusce nec urna eu nunc ultrices gravida sit amet eget ipsum. Phasellus sed purus massa, sit amet lobortis augue. Curabitur facilisis ligula a mi posuere."

BlockFile.open(data_fn, function(err, bf){
  if (err) throw err
  var strLen = Buffer.byteLength(str)
    , buf = new Buffer(strLen+2)
    , promises = []

  buf.writeUInt16BE(strLen, 0)
  buf.write(str, 2, strLen)

  async.series(
    [ function(scb){ bf.store(buf, scb) }
    , function(scb){ bf.store(buf, scb) }
    ]
  , function(err, res){
      console.warn("res = %j", res)
      if (err) throw err
      hdls = res
      bf.close(function(err){
        if (err) throw err
        var a = hdls.map(function(hdl){ return hdl.toString() })
        console.log(a)
        fs.writeFileSync(hdls_fn, JSON.stringify(a))
      })
    })
})
