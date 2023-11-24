const tapable = require('tapable')

const hook = new tapable.AsyncSeriesLoopHook(['name', 'age'], 'MyAsyncSeriesLoopHook')

hook.tap('before', (name, age) => {
	console.log('before: ', name, age)
})

hook.tap({
	name: 'after',
}, (name, age) => {
	console.log('after: ', name, age)
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
hook.promise('Lee', 20).then((res => {
  console.log('over: ', res)
})).catch(err => {
  console.log('over error: ', err)
})
// 输出
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
// intercept done first: 
// intercept done second: 
// over:  undefined


console.log(hook.promise.toString())
// 输出
function anonymous(name, age) {
  "use strict";
  var _context;
  var _x = this._x;
  var _taps = this.taps;
  var _interceptors = this.interceptors;
  return new Promise((function (_resolve, _reject) {
    var _sync = true;
    function _error(_err) {
      if (_sync)
        _resolve(Promise.resolve().then((function () { throw _err; })));
      else
        _reject(_err);
    };
    _interceptors[0].call(name, age);
    _interceptors[1].call(name, age);
    var _loop;
    do {
      _loop = false;
      var _tap0 = _taps[0];
      _interceptors[0].tap(_tap0);
      _interceptors[1].tap(_tap0);
      var _fn0 = _x[0];
      var _hasError0 = false;
      try {
        var _result0 = _fn0(name, age);
      } catch (_err) {
        _hasError0 = true;
        _interceptors[0].error(_err);
        _interceptors[1].error(_err);
        _error(_err);
      }
      if (!_hasError0) {
        if (_result0 !== undefined) {
          _loop = true;
        } else {
          var _tap1 = _taps[1];
          _interceptors[0].tap(_tap1);
          _interceptors[1].tap(_tap1);
          var _fn1 = _x[1];
          var _hasError1 = false;
          try {
            var _result1 = _fn1(name, age);
          } catch (_err) {
            _hasError1 = true;
            _interceptors[0].error(_err);
            _interceptors[1].error(_err);
            _error(_err);
          }
          if (!_hasError1) {
            if (_result1 !== undefined) {
              _loop = true;
            } else {
              if (!_loop) {
                _interceptors[0].done();
                _interceptors[1].done();
                _resolve();
              }
            }
          }
        }
      }
    } while (_loop);
    _sync = false;
  }));
}