import { types } from "@algo-builder/web";
import { getApplicationAddress } from "algosdk";
import { assert } from "chai";
import sinon from 'sinon';

import { RUNTIME_ERRORS } from "../../../src/errors/errors-list";
import { Runtime } from "../../../src/index";
import { AccountStoreI, AppDeploymentFlags, AppInfo, TxReceipt } from "../../../src/types";
import { useFixture } from "../../helpers/integration";
import { expectRuntimeError } from "../../helpers/runtime-errors";

describe("C2C call", function () {
  useFixture("c2c-call");
  let runtime: Runtime;
  let alice: AccountStoreI;
  let firstApp: AppInfo;
  let secondApp: AppInfo;

  let appCallArgs: string[];

  let flags: AppDeploymentFlags;

  function fundToApp(funder: AccountStoreI, appInfo: AppInfo) {
    const fundTx: types.AlgoTransferParam = {
      type: types.TransactionType.TransferAlgo,
      sign: types.SignType.SecretKey,
      fromAccount: funder.account,
      toAccountAddr: appInfo.applicationAccount,
      amountMicroAlgos: 1e6,
      payFlags: {
        totalFee: 1000
      }
    };
    runtime.executeTx(fundTx);
  }

  this.beforeEach(() => {
    runtime = new Runtime([]);
    [alice] = runtime.defaultAccounts();
    flags = {
      sender: alice.account,
      localBytes: 1,
      globalBytes: 1,
      localInts: 1,
      globalInts: 1
    };
    // deploy first app
    firstApp = runtime.deployApp('c2c-call.teal', 'clear.teal', flags, {});
    secondApp = runtime.deployApp('c2c-echo.teal', 'clear.teal', flags, {});

    // fund to application
    fundToApp(alice, firstApp);
    fundToApp(alice, secondApp)

    appCallArgs = ['str:call_method', 'int:1'];
  });

  it("can call another application", () => {
    const execParams: types.ExecParams = {
      type: types.TransactionType.CallApp,
      sign: types.SignType.SecretKey,
      fromAccount: alice.account,
      foreignApps: [secondApp.appID],
      appID: firstApp.appID,
      appArgs: appCallArgs,
      payFlags: {
        totalFee: 2000
      }
    };
    const txReceipt = runtime.executeTx(execParams) as TxReceipt;
    const logs = txReceipt.logs ?? [];
    assert.deepEqual(logs[0].substring(6), "Call from applicatiton");
  });

  describe("c2c call unhappy case", function () {
    let thirdApp: AppInfo;
    this.beforeEach(() => {
      thirdApp = runtime.deployApp('dummy-approval-v5.teal', 'dummy-clear-v5.teal', flags, {});
      fundToApp(alice, thirdApp);
    });

    it("should failed: inner call to app have teal version 5", () => {
      const execParams: types.ExecParams = {
        type: types.TransactionType.CallApp,
        sign: types.SignType.SecretKey,
        fromAccount: alice.account,
        foreignApps: [thirdApp.appID],
        appID: firstApp.appID,
        appArgs: appCallArgs,
        payFlags: {
          totalFee: 2000
        }
      };

      expectRuntimeError(
        () => runtime.executeTx(execParams),
        RUNTIME_ERRORS.GENERAL.INNER_APP_CALL_INVALID_VERSION
      );
    });

    it("should failed: inner tx appl self-call", () => {
      const execParams: types.ExecParams = {
        type: types.TransactionType.CallApp,
        sign: types.SignType.SecretKey,
        fromAccount: alice.account,
        foreignApps: [firstApp.appID],
        appID: firstApp.appID,
        appArgs: appCallArgs,
        payFlags: {
          totalFee: 2000
        }
      };

      expectRuntimeError(
        () => runtime.executeTx(execParams),
        RUNTIME_ERRORS.GENERAL.INNER_APPL_SELF_CALL
      );
    });
  })

  it("Should not support other inner tx appl(not include appcall)", () => {
    let appInfo = runtime.deployApp('inner-tx-deploy.py', 'clear.teal', flags, {});

    const execParams: types.ExecParams = {
      type: types.TransactionType.CallApp,
      sign: types.SignType.SecretKey,
      fromAccount: alice.account,
      appID: appInfo.appID,
      payFlags: {
        totalFee: 2000
      }
    }; 

    assert.doesNotThrow(() => runtime.executeTx(execParams));
    assert.isTrue((console['warn'] as any).calledWith('This action not support in current Runtime version.'));
  })
});
