/**
 * @fileOverview Tests for the Lambda function wrapper index template.
 */

// Core.
var path = require('path');

// Local.
var resources = require('../../../resources');
var applicationConfig = require('../../../resources/mockApplication/applicationConfig');
var scratchDir = resources.getScratchDirectory();

describe('lib/build/template/index.js.hbs', function () {

  var wrapperMessage;
  var wrapperMessageHandleFunction;
  var wrapperInvocation;
  var wrapperInvocationHandleFunction;
  var originalMessage;
  var originalInvocation;
  var arnMap;

  var sandbox;

  before(function (done) {
    // Needs time to set up the mock application as there are npm install
    // commands in there.
    this.timeout(30000);
    // Set up the mock application.
    resources.setUpMockApplication(applicationConfig, done);
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();

    wrapperMessage = require(path.join(
      scratchDir,
      applicationConfig.name,
      'message'
    ));
    wrapperInvocation = require(path.join(
      scratchDir,
      applicationConfig.name,
      'invocation'
    ));
    originalMessage = require(path.join(
      scratchDir,
      applicationConfig.name,
      'message/_index'
    ));
    originalInvocation = require(path.join(
      scratchDir,
      applicationConfig.name,
      'invocation/_index'
    ));

    // Need to stuff the ARN map into the right place since all of these
    // functions aside from the handler assume the handler is putting it in
    // place before they are called.
    arnMap = resources.getMockArnMap(applicationConfig);
    wrapperMessage.lc.arnMap = arnMap;
    wrapperInvocation.lc.arnMap = arnMap;

    // Make sure we stub the AWS client functions used here.
    sandbox.stub(wrapperMessage.lc.utilities, 'invoke').yields();
    sandbox.stub(wrapperInvocation.lc.utilities, 'invoke').yields();
    // These will need to be redefined to return data for tests that use them.
    sandbox.stub(wrapperMessage.lc.utilities, 'deleteMessage').yields();
    sandbox.stub(wrapperInvocation.lc.utilities, 'deleteMessage').yields();
    sandbox.stub(wrapperMessage.lc.utilities, 'receiveMessage').yields();
    sandbox.stub(wrapperInvocation.lc.utilities, 'receiveMessage').yields();
    sandbox.stub(wrapperMessage.lc.utilities, 'sendMessage').yields();
    sandbox.stub(wrapperInvocation.lc.utilities, 'sendMessage').yields();
    sandbox.stub(wrapperMessage.lc.utilities, 'getQueueAttributes').yields();
    sandbox.stub(wrapperInvocation.lc.utilities, 'getQueueAttributes').yields();
    sandbox.stub(wrapperMessage.lc.utilities, 'loadArnMap').yields(null, arnMap);
    sandbox.stub(wrapperInvocation.lc.utilities, 'loadArnMap').yields(null, arnMap);

    // Stub the original handles.
    wrapperMessageHandleFunction = wrapperMessage.lc.utilities.getFunctionNameFromHandle(
      wrapperMessage.lc.handler
    );
    wrapperInvocationHandleFunction = wrapperInvocation.lc.utilities.getFunctionNameFromHandle(
      wrapperInvocation.lc.handler
    );

    sandbox.stub(originalMessage, wrapperMessageHandleFunction);
    sandbox.stub(originalInvocation, wrapperInvocationHandleFunction);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('lc.deleteMessageFromInputQueue', function () {
    var receiptHandle;

    beforeEach(function () {
      receiptHandle = 'receipt-handle';
    });

    it('calls underlying utilities function as expected', function (done) {
      wrapperMessage.lc.deleteMessageFromInputQueue(receiptHandle, function (error) {
        expect(error).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.utilities.deleteMessage, 1);
        sinon.assert.alwaysCalledWith(
          wrapperMessage.lc.utilities.deleteMessage,
          wrapperMessage.lc.utilities.getQueueUrl(
            wrapperMessage.lc.component.name,
            arnMap
          ),
          receiptHandle,
          sinon.match.func
        );

        done();
      });
    });
  });

  describe('lc.sendDataToDestination', function () {
    var data;

    beforeEach(function () {
      data = {};
    });

    it('invokes function for message destination', function (done) {
      var name = 'message';
      wrapperMessage.lc.sendDataToDestination(data, name, function (error) {
        expect(error).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.invoke);
        sinon.assert.calledWith(
          wrapperMessage.lc.utilities.sendMessage,
          wrapperMessage.lc.utilities.getQueueUrl(
            wrapperMessage.lc.componentsByName[name].name,
            wrapperMessage.lc.arnMap
          ),
          data,
          sinon.match.func
        );
        done();
      });
    });

    it('invokes function for invocation destination', function (done) {
      var name = 'invocation';
      wrapperMessage.lc.sendDataToDestination(data, name, function (error) {
        expect(error).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.sendMessage);
        sinon.assert.calledWith(
          wrapperMessage.lc.utilities.invoke,
          wrapperMessage.lc.utilities.getLambdaFunctionArn(
            name,
            wrapperMessage.lc.arnMap
          ),
          data,
          sinon.match.func
        );
        done();
      });
    });

    it('calls back with error for an invalid destination', function (done) {
      wrapperMessage.lc.sendDataToDestination(data, 'invalid', function (error) {
        expect(error).to.be.an.instanceof(Error);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.sendMessage);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.invoke);
        done();
      });
    });

    it('calls back with error for an invalid component type', function (done) {
      var stashedType = wrapperMessage.lc.componentsByName.invocation.type;
      wrapperMessage.lc.componentsByName.invocation.type = 'invalid';

      wrapperMessage.lc.sendDataToDestination(data, 'invocation', function (error) {
        expect(error).to.be.an.instanceof(Error);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.sendMessage);
        sinon.assert.notCalled(wrapperMessage.lc.utilities.invoke);

        wrapperMessage.lc.componentsByName.invocation.type = stashedType;
        done();
      });
    });

  });

  describe('lc.sendData', function () {

    var error;
    var results;

    beforeEach(function () {
      error = undefined;
      results = {};
      sandbox.stub(wrapperMessage.lc, 'sendDataToDestination').yields();
    });

    afterEach(function () {
      wrapperMessage.lc.component.routing = undefined;
    });

    it('invokes sendDataToDestination for a string destination', function (done) {
      wrapperMessage.lc.component.routing = 'component-a';

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.sendDataToDestination, 1);
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          wrapperMessage.lc.component.routing,
          sinon.match.func
        );

        done();
      });
    });

    it('does not send data for a string destination on error', function (done) {
      error = new Error();
      wrapperMessage.lc.component.routing = 'component-a';

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);

        done();
      });
    });

    it('invokes sendDataToDestination for array of string destinations', function (done) {
      wrapperMessage.lc.component.routing = [
        'component-a',
        'component-b'
      ];

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.sendDataToDestination, 2);
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          wrapperMessage.lc.component.routing[0],
          sinon.match.func
        );
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          wrapperMessage.lc.component.routing[1],
          sinon.match.func
        );

        done();
      });
    });

    it('calls back with error on error in underlying functions', function (done) {
      wrapperMessage.lc.component.routing = 'component-a';
      wrapperMessage.lc.sendDataToDestination.yields(new Error());

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.be.an.instanceof(Error);
        done();
      });
    });

    it('calls back without error if no destinations', function (done) {
      wrapperMessage.lc.component.routing = undefined;

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);
        done();
      });
    });

    it('calls back without error if empty destinations array', function (done) {
      wrapperMessage.lc.component.routing = [];

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);
        done();
      });
    });

    it('invokes sendDataToDestination for a function destination', function (done) {
      var name = 'component-a';
      wrapperMessage.lc.component.routing = function (result) {
        return {
          name: name,
          data: results
        };
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.sendDataToDestination, 1);
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          name,
          sinon.match.func
        );

        done();
      });
    });

    it('invokes sendDataToDestination for a function destination on error', function (done) {
      error = new Error();
      var name = 'component-a';
      wrapperMessage.lc.component.routing = function (result) {
        return {
          name: name,
          data: results
        };
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.sendDataToDestination, 1);
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          name,
          sinon.match.func
        );

        done();
      });
    });

    it('invokes sendDataToDestination for a function returning multiple destinations', function (done) {
      var names = [
        'component-a',
        'component-b'
      ];
      wrapperMessage.lc.component.routing = function (result) {
        return [
          {
            name: names[0],
            data: results
          },
          {
            name: names[1],
            data: results
          }
        ];
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);

        sinon.assert.callCount(wrapperMessage.lc.sendDataToDestination, 2);
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          names[0],
          sinon.match.func
        );
        sinon.assert.calledWith(
          wrapperMessage.lc.sendDataToDestination,
          results,
          names[1],
          sinon.match.func
        );

        done();
      });
    });

    it('does not send for a function destination returning nothing', function (done) {
      wrapperMessage.lc.component.routing = function (result) {
        return;
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);

        done();
      });
    });

    it('does not send for a function destination returning an empty array', function (done) {
      wrapperMessage.lc.component.routing = function (result) {
        return [];
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);

        done();
      });
    });

    it('does not send for a function destination returning invalid entities', function (done) {
      wrapperMessage.lc.component.routing = function (result) {
        return [
          null,
          undefined,
          /x/,
          {}
        ];
      };

      wrapperMessage.lc.sendData(error, results, function (sendError) {
        expect(sendError).to.equal(undefined);
        sinon.assert.notCalled(wrapperMessage.lc.sendDataToDestination);

        done();
      });
    });


  });

  describe('lc.wrapContext', function () {

    var clock;
    var context;
    var result;
    var wrappedContextMessage;
    var wrappedContextInvocation;

    beforeEach(function () {
      clock = sandbox.useFakeTimers();

      sandbox.stub(wrapperMessage.lc, 'sendData').yields();
      sandbox.stub(wrapperMessage.lc, 'deleteMessageFromInputQueue').yields();
      sandbox.stub(wrapperInvocation.lc, 'sendData').yields();
      sandbox.stub(wrapperInvocation.lc, 'deleteMessageFromInputQueue').yields();
      sandbox.stub(console, 'error');

      context = {
        done: sandbox.stub(),
        fail: sandbox.stub(),
        getRemainingTimeInMillis: sandbox.stub(),
        succeed: sandbox.stub()
      };

      result = {};

      wrappedContextMessage = wrapperMessage.lc.wrapContext(context);
      wrappedContextInvocation = wrapperInvocation.lc.wrapContext(context);

      wrappedContextMessage.receiptHandle = 'receipt-handle';
    });

    describe('for eventFromInvocation component type', function () {

      it('wrappedContext.getRemainingTimeInMillis passthrough', function () {
        wrappedContextInvocation.getRemainingTimeInMillis();
        sinon.assert.calledOnce(context.getRemainingTimeInMillis);
        sinon.assert.alwaysCalledWith(context.getRemainingTimeInMillis);
      });

      it('wrappedContext.fail passthrough', function () {
        var error = new Error();
        wrappedContextInvocation.fail(error);
        clock.tick(100);

        sinon.assert.calledOnce(wrapperInvocation.lc.sendData);
        sinon.assert.alwaysCalledWith(
          wrapperInvocation.lc.sendData,
          error,
          undefined,
          sinon.match.func
        );

        sinon.assert.notCalled(wrapperInvocation.lc.deleteMessageFromInputQueue);
        sinon.assert.calledOnce(console.error);
        sinon.assert.calledOnce(context.fail);
        sinon.assert.alwaysCalledWith(context.fail, error);
      });

      describe('wrappedContext.done', function () {

        it('with no errors makes all underlying calls', function () {
          wrappedContextInvocation.done(undefined, result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperInvocation.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperInvocation.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(context.done);
          sinon.assert.alwaysCalledWith(context.done, undefined, result);
        });

        it('on send data error makes appropriate calls', function () {
          var error = new Error();
          wrapperInvocation.lc.sendData.yields(error);
          wrappedContextInvocation.done(undefined, result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperInvocation.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperInvocation.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperInvocation.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(console.error);
          sinon.assert.calledOnce(context.done);
          sinon.assert.alwaysCalledWith(context.done, error, result);
        });
      });

      describe('wrappedContext.succeed', function () {

        it('with no errors makes all underlying calls', function () {
          wrappedContextInvocation.succeed(result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperInvocation.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperInvocation.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperInvocation.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(context.succeed);
          sinon.assert.alwaysCalledWith(context.succeed, result);
        });

        it('on send data error makes appropriate calls', function () {
          var error = new Error();
          wrapperInvocation.lc.sendData.yields(error);
          wrappedContextInvocation.succeed(result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperInvocation.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperInvocation.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperInvocation.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(console.error);
          sinon.assert.notCalled(context.succeed);
          sinon.assert.calledOnce(context.fail);
          sinon.assert.alwaysCalledWith(context.fail, error);
        });
      });
    });

    describe('for eventFromMessage component type', function () {

      it('wrappedContext.getRemainingTimeInMillis passthrough', function () {
        wrappedContextMessage.getRemainingTimeInMillis();
        sinon.assert.calledOnce(context.getRemainingTimeInMillis);
        sinon.assert.alwaysCalledWith(context.getRemainingTimeInMillis);
      });

      it('wrappedContext.fail passthrough', function () {
        var error = new Error();
        wrappedContextMessage.fail(error);
        clock.tick(100);

        sinon.assert.calledOnce(wrapperMessage.lc.sendData);
        sinon.assert.alwaysCalledWith(
          wrapperMessage.lc.sendData,
          error,
          undefined,
          sinon.match.func
        );

        sinon.assert.notCalled(wrapperMessage.lc.deleteMessageFromInputQueue);
        sinon.assert.calledOnce(console.error);
        sinon.assert.calledOnce(context.fail);
        sinon.assert.alwaysCalledWith(context.fail, error);
      });

      describe('wrappedContext.done', function () {

        it('with no errors makes all underlying calls', function () {
          wrappedContextMessage.done(undefined, result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.calledOnce(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.deleteMessageFromInputQueue,
            wrappedContextMessage.receiptHandle,
            sinon.match.func
          );

          sinon.assert.calledOnce(context.done);
          sinon.assert.alwaysCalledWith(context.done, undefined, result);
        });

        it('on send data error makes appropriate calls', function () {
          var error = new Error();
          wrapperMessage.lc.sendData.yields(error);
          wrappedContextMessage.done(undefined, result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(console.error);
          sinon.assert.calledOnce(context.done);
          sinon.assert.alwaysCalledWith(context.done, error, result);
        });

        it('on delete message error makes appropriate calls', function () {
          var error = new Error();
          wrapperMessage.lc.deleteMessageFromInputQueue.yields(error);
          wrappedContextMessage.done(undefined, result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.calledOnce(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.deleteMessageFromInputQueue,
            wrappedContextMessage.receiptHandle,
            sinon.match.func
          );

          sinon.assert.calledOnce(console.error);
          sinon.assert.calledOnce(context.done);
          sinon.assert.alwaysCalledWith(context.done, error, result);
        });
      });

      describe('wrappedContext.succeed', function () {

        it('with no errors makes all underlying calls', function () {
          wrappedContextMessage.succeed(result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.calledOnce(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.deleteMessageFromInputQueue,
            wrappedContextMessage.receiptHandle,
            sinon.match.func
          );

          sinon.assert.calledOnce(context.succeed);
          sinon.assert.alwaysCalledWith(context.succeed, result);
        });

        it('on send data error makes appropriate calls', function () {
          var error = new Error();
          wrapperMessage.lc.sendData.yields(error);
          wrappedContextMessage.succeed(result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.notCalled(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.calledOnce(console.error);
          sinon.assert.notCalled(context.succeed);
          sinon.assert.calledOnce(context.fail);
          sinon.assert.alwaysCalledWith(context.fail, error);
        });

        it('on delete message error makes appropriate calls', function () {
          var error = new Error();
          wrapperMessage.lc.deleteMessageFromInputQueue.yields(error);
          wrappedContextMessage.succeed(result);
          clock.tick(100);

          sinon.assert.calledOnce(wrapperMessage.lc.sendData);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.sendData,
            undefined,
            result,
            sinon.match.func
          );

          sinon.assert.calledOnce(wrapperMessage.lc.deleteMessageFromInputQueue);
          sinon.assert.alwaysCalledWith(
            wrapperMessage.lc.deleteMessageFromInputQueue,
            wrappedContextMessage.receiptHandle,
            sinon.match.func
          );

          sinon.assert.calledOnce(console.error);
          sinon.assert.calledOnce(context.fail);
          sinon.assert.alwaysCalledWith(context.fail, error);
        });

      });
    });

  });

  describe('lc.handleAsEventFromInvocationType', function () {

    it('passes through to underlying handle', function () {
      var event = {};
      var wrappedContext = {};

      wrapperInvocation.lc.handleAsEventFromInvocationType(
        event,
        wrappedContext
      );

      sinon.assert.calledWith(
        originalInvocation[wrapperInvocationHandleFunction],
        event,
        wrappedContext
      );
    });
  });

  describe('lc.handleAsEventFromMessageType', function () {
    var clock;
    var wrappedContext;
    var eventFromMessage;
    var message;

    beforeEach(function () {

      clock = sandbox.useFakeTimers();
      wrappedContext = {
        done: sandbox.stub(),
        fail: sandbox.stub(),
        getRemainingTimeInMillis: sandbox.stub(),
        succeed: sandbox.stub()
      };
      eventFromMessage = {};
      message = {
        message: JSON.stringify(eventFromMessage),
        receiptHandle: 'test-receipt-handle'
      };
    });

    it('calls context.succeed rather than handle if no message', function () {
      wrapperMessage.lc.utilities.receiveMessage.yields();

      wrapperMessage.lc.handleAsEventFromMessageType({}, wrappedContext);
      clock.tick(100);

      sinon.assert.notCalled(originalMessage[wrapperMessageHandleFunction]);
      sinon.assert.calledOnce(wrappedContext.succeed);
      sinon.assert.alwaysCalledWith(wrappedContext.succeed);
    });

    it('calls context.fail on SQS client error', function () {
      var error = new Error();
      wrapperMessage.lc.utilities.receiveMessage.yields(error);

      wrapperMessage.lc.handleAsEventFromMessageType({}, wrappedContext);
      clock.tick(100);

      sinon.assert.notCalled(originalMessage[wrapperMessageHandleFunction]);
      sinon.assert.calledOnce(wrappedContext.fail);
      sinon.assert.alwaysCalledWith(wrappedContext.fail, error);
    });

    it('receives from SQS and passes through to underlying handle', function () {
      wrapperMessage.lc.utilities.receiveMessage.yields(
        undefined,
        message
      );

      wrapperMessage.lc.handleAsEventFromMessageType({}, wrappedContext);
      clock.tick(100);

      sinon.assert.calledWith(
        originalMessage[wrapperMessageHandleFunction],
        eventFromMessage,
        wrappedContext
      );
    });


    it('receives from SQS and stashes message receipt handle', function () {
      wrapperMessage.lc.utilities.receiveMessage.yields(
        undefined,
        message
      );

      wrapperMessage.lc.handleAsEventFromMessageType({}, wrappedContext);
      clock.tick(100);
      expect(wrappedContext.receiptHandle).to.equal(message.receiptHandle);
    });
  });

  describe('wrapped handle', function () {
    var event;
    var context;
    var wrappedContext;

    beforeEach(function () {
      event = {};
      context = {
        done: sandbox.stub(),
        fail: sandbox.stub(),
        getRemainingTimeInMillis: sandbox.stub(),
        succeed: sandbox.stub()
      };

      // Remove the ARN map, as this function should be putting it in place.
      wrapperMessage.lc.arnMap = undefined;
      wrapperInvocation.lc.arnMap = undefined;

      wrappedContext = {
        done: sandbox.stub(),
        fail: sandbox.stub(),
        getRemainingTimeInMillis: sandbox.stub(),
        succeed: sandbox.stub()
      };

      // Prevent logging.
      sandbox.stub(console, 'info');

      sandbox.stub(wrapperInvocation.lc, 'handleAsEventFromInvocationType');
      sandbox.stub(wrapperInvocation.lc, 'handleAsEventFromMessageType');
      sandbox.stub(wrapperMessage.lc, 'handleAsEventFromMessageType');
      sandbox.stub(wrapperMessage.lc, 'handleAsEventFromInvocationType');

      // Dummy the wrapping of the context to return the same stubbed context
      // above rather than something new.
      sandbox.stub(wrapperInvocation.lc, 'wrapContext').returns(wrappedContext);
      sandbox.stub(wrapperMessage.lc, 'wrapContext').returns(wrappedContext);
    });

    it('calls correct function for invocation type', function () {
      wrapperInvocation[wrapperInvocationHandleFunction](event, context);

      sinon.assert.calledWith(wrapperInvocation.lc.wrapContext, context);
      sinon.assert.calledWith(
        wrapperInvocation.lc.handleAsEventFromInvocationType,
        event,
        sinon.match.same(wrappedContext)
      );
      sinon.assert.notCalled(wrapperInvocation.lc.handleAsEventFromMessageType);
    });

    it('calls correct function for message type', function () {
      wrapperMessage[wrapperMessageHandleFunction](event, context);

      sinon.assert.calledWith(wrapperMessage.lc.wrapContext, context);
      sinon.assert.calledWith(
        wrapperMessage.lc.handleAsEventFromMessageType,
        event,
        sinon.match.same(wrappedContext)
      );
      sinon.assert.notCalled(
        wrapperMessage.lc.handleAsEventFromInvocationType
      );
    });

    it('calls wrappedContext.fail for invalid type', function () {
      var stashedType = wrapperMessage.lc.component.type;
      wrapperMessage.lc.component.type = 'not-a-type';

      wrapperMessage[wrapperMessageHandleFunction](event, context);

      sinon.assert.calledWith(
        wrappedContext.fail,
        sinon.match.instanceOf(Error)
      );
      sinon.assert.notCalled(
        wrapperInvocation.lc.handleAsEventFromInvocationType
      );
      sinon.assert.notCalled(
        wrapperInvocation.lc.handleAsEventFromMessageType
      );

      // Restore the right type.
      wrapperMessage.lc.component.type = stashedType;
    });


  });

});
