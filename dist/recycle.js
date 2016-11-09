'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.recycler = recycler;
exports.recycle = recycle;
exports.recyclable = recyclable;

var _xstreamRun = require('@cycle/xstream-run');

var _xstreamRun2 = _interopRequireDefault(_xstreamRun);

var _performanceNow = require('performance-now');

var _performanceNow2 = _interopRequireDefault(_performanceNow);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isFunction(value) {
  return typeof value === 'function';
}

function isObject(value) {
  return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object';
}

function isStream(value) {
  return !!value && (isFunction(value.subcribe) || isFunction(value.addListener));
}

function isArray(array) {
  return Array.isArray(array);
}

var SourceType = either({
  'object': function object(sources) {
    return isObject(sources) && !isArray(sources) && !isStream(sources);
  },
  'stream': isStream,
  'function': isFunction,
  'array': isArray,
  'undefined': function undefined(val) {
    return typeof val === 'undefined';
  }
});

function recycler(Cycle, app, driversFactory) {
  var drivers = driversFactory();

  var _Cycle = Cycle(app, drivers),
      sinks = _Cycle.sinks,
      sources = _Cycle.sources,
      run = _Cycle.run;

  var dispose = run();

  return function (app) {
    var newDrivers = driversFactory();
    var newSinksSourceDispose = recycle(app, driversFactory(), drivers, { sources: sources, sinks: sinks, dispose: dispose });

    sinks = newSinksSourceDispose.sinks;
    sources = newSinksSourceDispose.sources;
    dispose = newSinksSourceDispose.dispose;
  };
}

function recycle(app, drivers, oldDrivers, _ref) {
  var sources = _ref.sources,
      sinks = _ref.sinks,
      dispose = _ref.dispose;

  dispose();

  var _Cycle2 = (0, _xstreamRun2.default)(app, drivers),
      run = _Cycle2.run,
      newSinks = _Cycle2.sinks,
      newSources = _Cycle2.sources;

  var newDispose = run();

  Object.keys(drivers).forEach(function (driverName) {
    var driver = drivers[driverName];

    driver.replayLog(oldDrivers[driverName].log);
  });

  return { sinks: newSinks, sources: newSources, dispose: newDispose };
}

function recyclable(driver) {
  var log = [];
  var proxySources = {};
  var replaying = false;

  function logStream(stream, identifier) {
    proxySources[identifier] = stream;

    return stream.debug(function (event) {
      if (!replaying) {
        log.push({ identifier: identifier, event: event, time: (0, _performanceNow2.default)() });
      }
    });
  }

  function logSourceFunction(func) {
    var identifier = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

    return function wrappedSourceFunction() {
      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var source = SourceType(func.apply(undefined, args));
      var funcIdentifier = identifier + '/' + func.name + '(' + args.join() + ')';

      return source.when({
        'object': function object(value) {
          return logSourceObject(value, funcIdentifier);
        },
        'stream': function stream(_stream) {
          return logStream(_stream, funcIdentifier);
        },
        'function': function _function(func) {
          return logSourceFunction(func, funcIdentifier);
        },
        'array': function array(_array) {
          return _array;
        },
        'undefined': function undefined(val) {
          return val;
        }
      });
    };
  }

  function logSourceObject(sources) {
    var identifier = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

    var newSources = {};

    var _loop = function _loop(sourceProperty) {
      var value = SourceType(sources[sourceProperty]);

      var propertyIdentifier = identifier + '/' + sourceProperty;

      var loggedSource = value.when({
        'object': function object(value) {
          return logSourceObject(value, propertyIdentifier);
        },
        'stream': function stream(_stream2) {
          return logStream(_stream2, propertyIdentifier);
        },
        'function': function _function(func) {
          return logSourceFunction(func.bind(sources), propertyIdentifier);
        },
        'array': function array(_array2) {
          return _array2;
        },
        'undefined': function undefined(val) {
          return val;
        }
      });

      newSources[sourceProperty] = loggedSource;

      if (sourceProperty === '_namespace') {
        newSources[sourceProperty] = sources[sourceProperty];
      }
    };

    for (var sourceProperty in sources) {
      _loop(sourceProperty);
    }

    return newSources;
  }

  function recyclableDriver(sink$, streamAdaptor) {
    var sources = SourceType(driver(sink$, streamAdaptor));

    return sources.when({
      'object': function object(sources) {
        return logSourceObject(sources);
      },
      'stream': function stream(source$) {
        return logStream(source$, ':root');
      },
      'function': function _function(func) {
        return logSourceFunction(func, ':root');
      },
      'array': function array(_array3) {
        return _array3;
      },
      'undefined': function undefined(val) {
        return val;
      }
    });
  }

  recyclableDriver.replayLog = function replayLog(newLog) {
    replaying = true;

    log = newLog;

    log.forEach(function (logEvent) {
      proxySources[logEvent.identifier].shamefullySendNext(logEvent.event);
    });

    replaying = false;
  };

  recyclableDriver.log = log;

  return recyclableDriver;
}

function either(states) {
  return function (value) {
    return {
      when: function when(handlers) {
        var stateKeys = Object.keys(states).sort();
        var handlersKeys = Object.keys(handlers).sort();

        stateKeys.forEach(function (_, index) {
          if (stateKeys[index] !== handlersKeys[index]) {
            throw new Error('Must handle possible state ' + stateKeys[index]);
          }
        });

        var called = 0;
        var returnValue = void 0;

        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = Object.keys(states)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var state = _step.value;

            var stateValidator = states[state];

            if (stateValidator(value) && called < 1) {
              returnValue = handlers[state](value);

              called += 1;
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        if (called === 0) {
          throw new Error('Unhandled possible type: ' + value);
        }

        return returnValue;
      },


      _value: value
    };
  };
}