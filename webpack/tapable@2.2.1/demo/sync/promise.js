const tapable = require('tapable')

const hook = new tapable.SyncHook(['name', 'age'], 'MySyncHook')

hook.tap({
	name: 'before',
}, (name, age) => {
	console.log('before: ', name, age)
})

hook.tap('after', (name, age) => {
	console.log('after: ', name, age)
})

let uid = 0
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

hook.promise('Lee', 20).then(res => {
  console.log('over: ', res)
}).catch(err => console.log('error: ', err))
// 输出:
// intercept register first
// intercept register first
// intercept register second
// intercept register second
// intercept call first:  Lee
// intercept call second:  Lee
// intercept tap first:  { type: 'sync', fn: [Function (anonymous)], name: 'before' }
// intercept tap second:  { type: 'sync', fn: [Function (anonymous)], name: 'before' }
// before:  Lee 20
// intercept tap first:  { type: 'sync', fn: [Function (anonymous)], name: 'after' }
// intercept tap second:  { type: 'sync', fn: [Function (anonymous)], name: 'after' }
// after:  Lee 20

console.log(hook.promise.toString())
// 输出:
function anonymous(name, age) {
  "use strict";
  return new Promise((_resolve, _reject) => {
    var _sync = true;
    function _error(_err) {
      if (_sync)
        _resolve(Promise.resolve().then(() => { throw _err; }));
      else
        _reject(_err);
    };
    var _context;
    var _x = this._x;
    var _taps = this.taps;
    var _interceptors = this.interceptors;
    _interceptors[0].call(name, age);
    _interceptors[1].call(name, age);
    var _tap0 = _taps[0];
    _interceptors[0].tap(_tap0);
    _interceptors[1].tap(_tap0);
    var _fn0 = _x[0];
    var _hasError0 = false;
    try {
      _fn0(name, age);
    } catch (_err) {
      _hasError0 = true;
      _error(_err);
    }
    if (!_hasError0) {
      var _tap1 = _taps[1];
      _interceptors[0].tap(_tap1);
      _interceptors[1].tap(_tap1);
      var _fn1 = _x[1];
      var _hasError1 = false;
      try {
        _fn1(name, age);
      } catch (_err) {
        _hasError1 = true;
        _error(_err);
      }
      if (!_hasError1) {
        _resolve();
      }
    }
    _sync = false;
  });
}
