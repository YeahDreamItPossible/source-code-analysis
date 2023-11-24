const tapable = require('tapable')

const hook = new tapable.AsyncParallelHook(['name', 'age'], 'MyAsyncParallelHook')

hook.tapAsync('before', (name, age, cb) => {
	console.log('before: ', name, age)
  console.log('before cb:', cb.toString())
  cb()
})

hook.tapAsync({
	name: 'after'
}, (name, age, cb) => {
	console.log('after: ', name, age)
  console.log('after cb:', cb.toString())
  cb()
})

hook.intercept({
	register (options) {
		console.log('intercept register first')
		return options
	},

	call (options) {
		console.log('intercept call first: ', options)
	},

	tap (options) {
		console.log('intercept tap first: ', options)
	},

	result (result) {
    console.log('intercept tap first: ', result)
  },

  error (err) {
  	console.log('intercept error first: ', err)
  },

  done () {
  	console.log('intercept done first: ')
  }
})

hook.intercept({
	register (options) {
		console.log('intercept register second')
		return options
	},

	call (options) {
		console.log('intercept call second: ', options)
	},

	tap (options) {
		console.log('intercept tap second: ', options)
	},

	result (result) {
    console.log('intercept tap second: ', result)
  },

  error (err) {
  	console.log('intercept error second: ', err)
  },

  done () {
  	console.log('intercept done second: ')
  }
})

// 这里的回调函数 除了error参数 是没有result参数的
hook.callAsync('Lee', 20, (err, result) => {
	if (err) {
		console.log('over error: ', err)
		return
	}
	console.log('over result:', result)
})
// 输出
// intercept register first
// intercept register first
// intercept register second
// intercept register second
// intercept call first:  Lee
// intercept call second:  Lee
// intercept tap first:  { type: 'async', fn: [Function (anonymous)], name: 'before' }
// intercept tap second:  { type: 'async', fn: [Function (anonymous)], name: 'before' }
// before:  Lee 20
// before cb: function(_err0) {
// if(_err0) {
// if(_counter > 0) {
// _interceptors[0].error(_err0);
// _interceptors[1].error(_err0);
// _callback(_err0);
// _counter = 0;
// }
// } else {
// if(--_counter === 0) _done();
// }
// }
// intercept tap first:  { type: 'async', fn: [Function (anonymous)], name: 'after' }
// intercept tap second:  { type: 'async', fn: [Function (anonymous)], name: 'after' }
// after:  Lee 20
// after cb: function(_err1) {
// if(_err1) {
// if(_counter > 0) {
// _interceptors[0].error(_err1);
// _interceptors[1].error(_err1);
// _callback(_err1);
// _counter = 0;
// }
// } else {
// if(--_counter === 0) _done();
// }
// }
// intercept done first: 
// intercept done second: 
// over result: undefined


console.log(hook.callAsync.toString())
// 输出
function anonymous(name, age, _callback) {
  "use strict";
  var _context;
  var _x = this._x;
  var _taps = this.taps;
  var _interceptors = this.interceptors;
  _interceptors[0].call(name, age);
  _interceptors[1].call(name, age);
  do {
    var _counter = 2;
    var _done = (function () {
      _interceptors[0].done();
      _interceptors[1].done();
      _callback();
    });
    if (_counter <= 0) break;
    var _tap0 = _taps[0];
    _interceptors[0].tap(_tap0);
    _interceptors[1].tap(_tap0);
    var _fn0 = _x[0];
    _fn0(name, age, (function (_err0) {
      if (_err0) {
        if (_counter > 0) {
          _interceptors[0].error(_err0);
          _interceptors[1].error(_err0);
          _callback(_err0);
          _counter = 0;
        }
      } else {
        if (--_counter === 0) _done();
      }
    }));
    if (_counter <= 0) break;
    var _tap1 = _taps[1];
    _interceptors[0].tap(_tap1);
    _interceptors[1].tap(_tap1);
    var _fn1 = _x[1];
    _fn1(name, age, (function (_err1) {
      if (_err1) {
        if (_counter > 0) {
          _interceptors[0].error(_err1);
          _interceptors[1].error(_err1);
          _callback(_err1);
          _counter = 0;
        }
      } else {
        if (--_counter === 0) _done();
      }
    }));
  } while (false);
}