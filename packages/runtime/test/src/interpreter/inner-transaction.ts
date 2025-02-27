import { decodeAddress, getApplicationAddress } from "algosdk";
import { assert } from "chai";

import { bobAcc } from "../../../../algob/test/mocks/account";
import { AccountStore } from "../../../src/account";
import { RUNTIME_ERRORS } from "../../../src/errors/errors-list";
import { Runtime } from "../../../src/index";
import { Interpreter } from "../../../src/interpreter/interpreter";
import { ALGORAND_ACCOUNT_MIN_BALANCE, MaxTEALVersion } from "../../../src/lib/constants";
import { AccountStoreI, ExecutionMode } from "../../../src/types";
import { expectRuntimeError } from "../../helpers/runtime-errors";
import { elonMuskAccount, johnAccount } from "../../mocks/account";
import { accInfo } from "../../mocks/stateful";
import { elonAddr, johnAddr, TXN_OBJ } from "../../mocks/txn";

export function setDummyAccInfo (acc: AccountStoreI): void {
  acc.appsLocalState = accInfo[0].appsLocalState;
  acc.appsTotalSchema = accInfo[0].appsTotalSchema;
  acc.createdApps = accInfo[0].createdApps;
}

describe("TEALv5: Inner Transactions", function () {
  const elonPk = decodeAddress(elonAddr).publicKey;
  let tealCode: string;
  let interpreter: Interpreter;

  // setup 1st account (to be used as sender)
  const elonAcc: AccountStoreI = new AccountStore(0, elonMuskAccount); // setup test account
  setDummyAccInfo(elonAcc);

  // setup 2nd account
  const johnAcc = new AccountStore(0, johnAccount);

  // setup 2nd account
  const bobAccount = new AccountStore(1000000, bobAcc);

  // setup application account
  const appAccAddr = getApplicationAddress(TXN_OBJ.apid);
  const applicationAccount = new AccountStore(
    ALGORAND_ACCOUNT_MIN_BALANCE,
    { addr: appAccAddr, sk: new Uint8Array(0) });

  const reset = (): void => {
    while (interpreter.stack.length() !== 0) { interpreter.stack.pop(); }
    interpreter.subTxn = undefined;
    interpreter.runtime.ctx.pooledApplCost = 0;
    interpreter.instructions = [];
    interpreter.innerTxns = [];
    interpreter.instructionIndex = 0;
    interpreter.runtime.ctx.tx = { ...TXN_OBJ, snd: Buffer.from(elonPk) };
    interpreter.runtime.ctx.gtxs = [interpreter.runtime.ctx.tx];
    interpreter.runtime.ctx.isInnerTx = false;
    // set new tx receipt
    interpreter.runtime.ctx.state.txReceipts.set(TXN_OBJ.txID, {
      txn: TXN_OBJ,
      txID: TXN_OBJ.txID
    });
  };

  const setUpInterpreter = (): void => {
    interpreter = new Interpreter();
    interpreter.runtime = new Runtime([elonAcc, johnAcc, bobAccount, applicationAccount]);
    interpreter.tealVersion = MaxTEALVersion;
    reset();
  };

  const executeTEAL = (tealCode: string): void => {
    // reset interpreter
    reset();

    interpreter.execute(tealCode, ExecutionMode.APPLICATION, interpreter.runtime, 0);
  };

  this.beforeAll(setUpInterpreter);

  describe("TestActionTypes", function () {
    it("should fail: itxn_submit without itxn_begin", function () {
      tealCode = `
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_SUBMIT_WITHOUT_ITXN_BEGIN
      );
    });

    it("should fail: itxn_field without itxn_begin", function () {
      tealCode = `
        int pay
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_WITHOUT_ITXN_BEGIN
      );
    });

    it("should fail: Invalid inner transaction type", function () {
      tealCode = `
        itxn_begin
        itxn_submit
        int 1
      `;
      assert.throws(
        () => executeTEAL(tealCode), `unsupported type for itxn_submit`);

      tealCode = `
        itxn_begin
        byte "pya"
        itxn_field Type
        itxn_submit
        int 1
      `;
      assert.throws(
        () => executeTEAL(tealCode), `Type does not represent 'pay', 'axfer', 'acfg' or 'afrz'`);
    });

    it("should fail: Type arg not a byte array", function () {
      // mixed up the int form for the byte form
      tealCode = `
        itxn_begin
        int pay
        itxn_field Type
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.INVALID_TYPE
      );
    });

    it("should fail: not a uint64", function () {
      // mixed up the byte form for the int form (vice versa of above)
      tealCode = `
        itxn_begin
        byte "pay"
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.INVALID_TYPE
      );
    });

    it("should fail: invalid types (good, but not allowed in tealv5)", function () {
      // good types, not alllowed yet
      tealCode = `
        itxn_begin
        byte "keyreg"
        itxn_field Type
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );

      tealCode = `
        itxn_begin
        byte "appl"
        itxn_field Type
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );
    });

    it("should fail: invalid types (good, but not allowed in tealv5) for TypeEnum", function () {
      // good types, not alllowed yet for type enums
      tealCode = `
        itxn_begin
        int keyreg
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );

      tealCode = `
        itxn_begin
        int appl
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );

      tealCode = `
        itxn_begin
        int 42
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );

      tealCode = `
        itxn_begin
        int 0
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );
    });

    it(`should fail: "insufficient balance" because app account is charged fee`, function () {
      // set application account balance to minimum
      applicationAccount.amount = BigInt(ALGORAND_ACCOUNT_MIN_BALANCE);

      // (defaults make these 0 pay|axfer to zero address, from app account)
      tealCode = `
        itxn_begin
        byte "pay"
        itxn_field Type
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );

      tealCode = `
        itxn_begin
        byte "axfer"
        itxn_field Type
        itxn_submit
        int 1
      `;

      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );

      tealCode = `
        itxn_begin
        int pay
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );

      tealCode = `
        itxn_begin
        int axfer
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );

      tealCode = `
        itxn_begin
        int acfg
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      expectRuntimeError(
        () => executeTEAL(tealCode),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );
    });

    it(`should pass if app account is funded`, function () {
      // increase balance
      const acc = interpreter.runtime.ctx.state.accounts.get(appAccAddr);
      if (acc) { acc.amount = BigInt(ALGORAND_ACCOUNT_MIN_BALANCE) * 10n; }

      // default receiver is zeroAddr, amount is 0
      tealCode = `
        itxn_begin
        byte "pay"
        itxn_field Type
        itxn_submit
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        int pay
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        byte "axfer"
        itxn_field Type
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));
    });

    it(`should pass: if app account is funded, without itxn_submit`, function () {
      tealCode = `
        itxn_begin
        byte "axfer"
        itxn_field Type
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        int pay
        itxn_field TypeEnum
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        byte "acfg"
        itxn_field Type
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        int acfg
        itxn_field TypeEnum
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        byte "afrz"
        itxn_field Type
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));

      tealCode = `
        itxn_begin
        int afrz
        itxn_field TypeEnum
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(tealCode));
    });
  });

  describe("TestFieldTypes", function () {
    const ConfigAddresses = ['ConfigAssetManager', 'ConfigAssetReserve', 'ConfigAssetFreeze', 'ConfigAssetClawback'];

    it('should pass: teal understand 32 bytes value is address with acfg address', () => {
      ConfigAddresses.forEach((configAddr) => {
        tealCode = `
        itxn_begin
        byte "01234567890123456789012345678901"
        itxn_field ${configAddr}
        int 1
      `;

        assert.doesNotThrow(() => executeTEAL(tealCode));
      });
    });

    it("should pass: use random address with asa config transaction with acfg address", () => {
      ConfigAddresses.forEach((configAddress) => {
        tealCode = `
          itxn_begin           
          addr KW5MRCMF4ICRW32EQFHJJQXF6O6DIXHD4URTXPD657B6QTQA3LWZSLJEUY
          itxn_field ${configAddress}
          int acfg
          itxn_field TypeEnum
          int 1
        `;
        assert.doesNotThrow(() => executeTEAL(tealCode));
      });
    });

    it(`should fail: not an address`, function () {
      tealCode = `
        itxn_begin
        byte "pay"
        itxn_field Sender
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.ADDR_NOT_VALID);

      tealCode = `
        itxn_begin
        int 7
        itxn_field Receiver
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);

      tealCode = `
        itxn_begin
        byte ""
        itxn_field CloseRemainderTo
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.ADDR_NOT_VALID);

      tealCode = `
        itxn_begin
        byte ""
        itxn_field AssetSender
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.ADDR_NOT_VALID);
    });

    it(`should fail: invalid ref, not a valid account address`, function () {
      // but a b32 string rep is not an account
      tealCode = `
        itxn_begin
        byte "GAYTEMZUGU3DOOBZGAYTEMZUGU3DOOBZGAYTEMZUGU3DOOBZGAYZIZD42E"
        itxn_field AssetCloseTo
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.ADDR_NOT_VALID);

      // b31 => not vaild account
      tealCode = `
        itxn_begin
        byte "0123456789012345678901234567890"
        itxn_field AssetCloseTo
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.ADDR_NOT_VALID);

      // int number =>  invaild type (should be bytes)
      tealCode = `
        itxn_begin
        int 9
        itxn_field AssetCloseTo
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);
    });

    it(`should fail: not a uint64`, function () {
      tealCode = `
        itxn_begin
        byte "pay"
        itxn_field Fee
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);

      tealCode = `
        itxn_begin
        byte 0x01
        itxn_field Amount
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);

      tealCode = `
        itxn_begin
        byte 0x01
        itxn_field XferAsset
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);

      tealCode = `
        itxn_begin
        byte 0x01
        itxn_field AssetAmount
      `;
      expectRuntimeError(() => executeTEAL(tealCode), RUNTIME_ERRORS.TEAL.INVALID_TYPE);
    });
  });

  describe("TestAppPay", function () {
    let pay: string;
    this.beforeAll(() => {
      pay = `
        itxn_begin
        itxn_field Amount
        itxn_field Receiver
        itxn_field Sender
        int pay
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;
    });

    it(`should assert sender, application balance 0 before pay`, function () {
      // set sender.balance == 0
      const elonAcc = interpreter.runtime.ctx.state.accounts.get(elonAddr);
      if (elonAcc) { elonAcc.amount = 0n; }
      const acc = interpreter.runtime.ctx.state.accounts.get(appAccAddr);
      if (acc) { acc.amount = 0n; }
      const checkBal = `
        txn Sender
        balance
        int 0
        ==
      `;
      // verify sender(of top level tx) balance
      assert.doesNotThrow(() => executeTEAL(checkBal));

      const checkAppBal = `
        global CurrentApplicationAddress
        balance
        int 0
        ==
      `;
      // verify app balance
      assert.doesNotThrow(() => executeTEAL(checkAppBal));
    });

    // /*
    //  * This would be a good test for rekeying support (sender should only be contract).
    //  * atm, sender in runtime can be diff (as we don't have a secret key validation)
    // it(`should fail: unauthorized transaction`, function () {
    //   const unauthorizedCode = `
    //     txn Sender
    //     txn Accounts 1
    //     int 100
    //   ` + pay;
    //   executeTEAL(unauthorizedCode);
    // });
    // */

    it(`should fail: insufficient balance`, function () {
      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
      ` + pay;

      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );
    });

    // TODO: check if this should indeed fail (if receiver account.balance < minBalance)
    it(`should pass: after increasing app account's balance`, function () {
      const acc = interpreter.runtime.ctx.state.accounts.get(appAccAddr);
      if (acc) { acc.amount = 1000000n; }

      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
      ` + pay;
      assert.doesNotThrow(() => executeTEAL(teal));

      const testSenderBal = `
        global CurrentApplicationAddress
        balance
        int 998900
        ==
      `;
      assert.doesNotThrow(() => executeTEAL(testSenderBal));

      const testReceiverBal = `
        txn Accounts 1
        balance
        int 100
        ==
      `;
      assert.doesNotThrow(() => executeTEAL(testReceiverBal));
    });

    it(`should test pay with closeRemTo`, function () {
      const acc = interpreter.runtime.ctx.state.accounts.get(elonAddr);
      if (acc) { acc.amount = 1000000n; }

      const teal = `
        itxn_begin
        int pay
        itxn_field TypeEnum
        txn Receiver
        itxn_field CloseRemainderTo
        itxn_submit
        int 1
      `;
      executeTEAL(teal);

      // verify app account's balance == 0
      const verifyBal = `
        global CurrentApplicationAddress
        balance
        !
      `;
      assert.doesNotThrow(() => executeTEAL(verifyBal));

      // assert receiver got most of the ALGO (minus fees)
      assert.equal(interpreter.runtime.ctx.getAccount(johnAddr)?.amount, 998000n);
    });
  });

  describe("TestAppAssetOptIn", function () {
    let axfer: string;
    this.beforeAll(() => {
      axfer = `
        itxn_begin
        int axfer
        itxn_field TypeEnum
        int 1
        itxn_field XferAsset
        int 2
        itxn_field AssetAmount
        txn Sender
        itxn_field AssetReceiver
        itxn_submit
        int 1
      `;
    });

    it(`should fail: invalid ASA Ref`, function () {
      TXN_OBJ.apas = []; // remove foreign assets refs
      expectRuntimeError(
        () => executeTEAL(axfer),
        RUNTIME_ERRORS.TEAL.INVALID_ASA_REFERENCE
      );
    });

    it(`should fail: ref is passed but bal == 0`, function () {
      TXN_OBJ.apas = [1, 9]; // set foreign asset
      expectRuntimeError(
        () => executeTEAL(axfer),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_BALANCE
      );
    });

    it(`should fail: not opted in`, function () {
      // increase app balance
      const acc = interpreter.runtime.ctx.state.accounts.get(appAccAddr);
      if (acc) { acc.amount = 1000000n; }

      // sufficient bal, but not optedIn
      expectRuntimeError(
        () => executeTEAL(axfer),
        RUNTIME_ERRORS.TRANSACTION.ASA_NOT_OPTIN
      );
    });

    it(`should test ASA optin, asa transfer`, function () {
      const optin = `
        itxn_begin
        int axfer
        itxn_field TypeEnum
        int 9
        itxn_field XferAsset
        int 0
        itxn_field AssetAmount
        global CurrentApplicationAddress
        itxn_field AssetReceiver
        itxn_submit
        int 1
      `;

      // does not exist
      expectRuntimeError(
        () => executeTEAL(optin),
        RUNTIME_ERRORS.ASA.ASSET_NOT_FOUND
      );

      let assetID = 0;
      const elonAcc = interpreter.runtime.ctx.state.accounts.get(elonAddr);
      if (elonAcc) {
        assetID = interpreter.runtime.ctx.deployASADef(
          'test-asa',
          { total: 10, decimals: 0, unitName: "TASA" },
          elonAddr,
          { creator: { ...elonAcc.account, name: 'elon' } }
        ).assetID;
      }

      // passes
      assert.doesNotThrow(() => executeTEAL(optin));

      // opted in, but balance=0
      expectRuntimeError(
        () => executeTEAL(axfer),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_ASSETS
      );

      // increase asa balance to 5
      const holding = interpreter.runtime.ctx.state.accounts.get(appAccAddr)?.getAssetHolding(assetID);
      if (holding) { holding.amount = 5n; }

      executeTEAL(axfer);
      executeTEAL(axfer);
      expectRuntimeError(
        () => executeTEAL(axfer), // already withdrawn 4, cannot withdraw 2 more
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_ASSETS
      );

      const verifyHolding = `
        global CurrentApplicationAddress
        int 1
        asset_holding_get AssetBalance
        assert
        int 1
        ==
      `;
      // verify ASA transfer
      assert.doesNotThrow(() => executeTEAL(verifyHolding));
    });

    it(`should test ASA close`, function () {
      const close = `
        itxn_begin
        int axfer
        itxn_field TypeEnum
        int 1
        itxn_field XferAsset
        int 0
        itxn_field AssetAmount
        txn Sender
        itxn_field AssetReceiver
        txn Sender
        itxn_field AssetCloseTo
        itxn_submit
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(close));

      const verifyClose = `
        global CurrentApplicationAddress
        int 1
        asset_holding_get AssetBalance
        !
        assert
        !
      `;
      // verify ASA close
      assert.doesNotThrow(() => executeTEAL(verifyClose));
    });
  });

  describe("TestAppAxfer", function () {
    let axfer: string;
    let assetID1: number;
    let assetID2: number;
    this.beforeAll(() => {
      const elonAcc = interpreter.runtime.ctx.state.accounts.get(elonAddr);
      if (elonAcc) {
        // in foreign-assets
        assetID1 = interpreter.runtime.ctx.deployASADef(
          'test-asa-1',
          { total: 11, decimals: 0, unitName: "TASA1" },
          elonAddr,
          { creator: { ...elonAcc.account, name: 'elon' } }
        ).assetID;

        // not in foreign-assets
        assetID2 = interpreter.runtime.ctx.deployASADef(
          'test-asa-2',
          { total: 22, decimals: 0, unitName: "TASA2" },
          elonAddr,
          { creator: { ...elonAcc.account, name: 'elon' } }
        ).assetID;
      }

      axfer = `
        itxn_begin
        int ${assetID1}
        itxn_field XferAsset
        itxn_field AssetAmount
        itxn_field AssetReceiver
        itxn_field Sender
        int axfer
        itxn_field TypeEnum
        itxn_submit
      `;

      TXN_OBJ.apas = [assetID1];
    });

    it(`should fail: invalid ASA Ref`, function () {
      const teal = `
        txn Sender
        int ${assetID2}
        asset_holding_get AssetBalance
        assert
        int 0
        ==
      `;

      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TEAL.INVALID_ASA_REFERENCE
      );
    });

    it(`should fail: Sender not opted-in`, function () {
      const teal = `
        txn Accounts 1
        int ${assetID1}
        asset_holding_get AssetBalance
        assert
        int 0
        ==
      `;

      // assert failed
      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TEAL.TEAL_ENCOUNTERED_ERR
      );
    });

    it(`should fail: app account not opted in`, function () {
      const teal = `
        global CurrentApplicationAddress
        int ${assetID1}
        asset_holding_get AssetBalance
        assert
        int 0
        ==
      `;

      // assert failed
      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TEAL.TEAL_ENCOUNTERED_ERR
      );
    });

    it(`should create new holding in appAccount`, function () {
      interpreter.runtime.ctx.optIntoASA(assetID1, appAccAddr, {});
      // increase asa balance to 5
      const holding =
        interpreter.runtime.ctx.state.accounts.get(appAccAddr)?.getAssetHolding(assetID1);
      if (holding) { holding.amount = 3000n; }

      const verifyHolding = `
        global CurrentApplicationAddress
        int ${assetID1}
        asset_holding_get AssetBalance
        assert
        int 3000
        ==
      `;
      assert.doesNotThrow(() => executeTEAL(verifyHolding));
    });

    it(`should fail: receiver not optedin`, function () {
      TXN_OBJ.apat = [Buffer.from(decodeAddress(johnAddr).publicKey)];
      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
      ` + axfer;

      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TRANSACTION.ASA_NOT_OPTIN
      );
    });

    it(`should fail: insufficient balance`, function () {
      // optin by txn Account1
      interpreter.runtime.ctx.optIntoASA(assetID1, johnAddr, {});

      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100000
      ` + axfer;

      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TRANSACTION.INSUFFICIENT_ACCOUNT_ASSETS
      );
    });

    it(`should fail: invalid asset reference for app account`, function () {
      // changing to random
      TXN_OBJ.apas = [1211, 323];

      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100000
      ` + axfer;

      expectRuntimeError(
        () => executeTEAL(teal),
        RUNTIME_ERRORS.TEAL.INVALID_ASA_REFERENCE
      );

      TXN_OBJ.apas = [assetID1]; // restore
    });

    it(`should fail: asset id not passed`, function () {
      const noid = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
        itxn_begin
        itxn_field AssetAmount
        itxn_field AssetReceiver
        itxn_field Sender
        int axfer
        itxn_field TypeEnum
        itxn_submit
        int 1
      `;

      // defaults to 0, which is not opted in
      expectRuntimeError(
        () => executeTEAL(noid),
        RUNTIME_ERRORS.TRANSACTION.ASA_NOT_OPTIN
      );
    });

    it(`should pass: inner transaction axfer`, function () {
      const teal = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
      ` + axfer + `
        int 1
      `;
      assert.doesNotThrow(() => executeTEAL(teal));

      // 100 spent by app
      const verifySenderBalCode = `
        global CurrentApplicationAddress
        int ${assetID1}
        asset_holding_get AssetBalance
        assert
        int 2900
        ==
      `;
      assert.doesNotThrow(() => executeTEAL(verifySenderBalCode));

      // 100 received by txn.accounts 1
      const verifyReceiverBalCode = `
        txn Accounts 1
        int ${assetID1}
        asset_holding_get AssetBalance
        assert
        int 100
        ==
      `;
      assert.doesNotThrow(() => executeTEAL(verifyReceiverBalCode));
    });
  });

  describe("TestBadField", () => {
    it(`should fail if fields are invalid`, function () {
      const pay = `
        global CurrentApplicationAddress
        txn Accounts 1
        int 100
        itxn_begin
        int 7
        itxn_field AssetAmount
        itxn_field Amount
        itxn_field Receiver
        itxn_field Sender
        int pay
        itxn_field TypeEnum
        txn Receiver
        // NOT ALLOWED
        itxn_field RekeyTo
        itxn_submit
      `;

      expectRuntimeError(
        () => executeTEAL(pay),
        RUNTIME_ERRORS.TEAL.ITXN_FIELD_ERR
      );
    });
  });

  describe("TestNumInner", () => {
    it(`should fail number of inner transactions > 16`, function () {
      const pay = `
        itxn_begin
        int 1
        itxn_field Amount
        txn Accounts 1
        itxn_field Receiver
        int pay
        itxn_field TypeEnum
        itxn_submit
      `;

      assert.doesNotThrow(() => executeTEAL(pay + `int 1`));
      assert.doesNotThrow(() => executeTEAL(pay + pay + `int 1`));
      assert.doesNotThrow(() => executeTEAL(pay + pay + pay + pay + pay + pay + pay + pay + `int 1`));

      let heavyCode = ``;
      for (let i = 0; i <= 17; ++i) { heavyCode += pay; }
      expectRuntimeError(
        () => executeTEAL(heavyCode),
        RUNTIME_ERRORS.GENERAL.MAX_INNER_TRANSACTIONS_EXCEEDED
      );
    });
  });

  describe("TestAssetCreate", () => {
    it(`should test asset creation inner transaction`, function () {
      const create = `
        itxn_begin
        int acfg
        itxn_field TypeEnum
        int 1000000
        itxn_field ConfigAssetTotal
        int 3
        itxn_field ConfigAssetDecimals
        byte "oz"
        itxn_field ConfigAssetUnitName
        byte "Gold"
        itxn_field ConfigAssetName
        byte "https://gold.rush/"
        itxn_field ConfigAssetURL
        itxn_submit
        int 1
      `;

      assert.doesNotThrow(() => executeTEAL(create));
    });
  });

  describe("TestAssetFreeze", () => {
    it(`should test asset freeze inner transaction (flow test)`, function () {
      const lastAssetID = interpreter.runtime.ctx.createdAssetID;

      const create = `
        itxn_begin
        int acfg
        itxn_field TypeEnum
        int 1000000
        itxn_field ConfigAssetTotal
        int 3
        itxn_field ConfigAssetDecimals
        byte "oz"
        itxn_field ConfigAssetUnitName
        byte "Gold"
        itxn_field ConfigAssetName
        byte "https://gold.rush/"
        itxn_field ConfigAssetURL
        global CurrentApplicationAddress
        itxn_field ConfigAssetFreeze
        itxn_submit
        int 1
      `;

      assert.doesNotThrow(() => executeTEAL(create));
      const createdAssetID = interpreter.runtime.ctx.createdAssetID;
      assert.equal(createdAssetID, lastAssetID + 1);

      const freeze = `
        itxn_begin
        int afrz
        itxn_field TypeEnum
        int ${createdAssetID}
        itxn_field FreezeAsset
        txn ApplicationArgs 0
        btoi
        itxn_field FreezeAssetFrozen
        txn Accounts 1
        itxn_field FreezeAssetAccount
        itxn_submit
        int 1
      `;

      TXN_OBJ.apas = [];
      expectRuntimeError(
        () => executeTEAL(freeze),
        RUNTIME_ERRORS.TEAL.INVALID_ASA_REFERENCE
      );

      TXN_OBJ.apas = [createdAssetID];
      TXN_OBJ.apaa = [Buffer.from(new Uint8Array([1]))];
      // does not hold Asset
      expectRuntimeError(
        () => executeTEAL(freeze),
        RUNTIME_ERRORS.TRANSACTION.ASA_NOT_OPTIN
      );

      // should freeze now
      interpreter.runtime.optIntoASA(createdAssetID, johnAddr, {});
      assert.doesNotThrow(() => executeTEAL(freeze));

      // verify freeze
      let johnHolding = interpreter.runtime.getAssetHolding(createdAssetID, johnAddr);
      assert.isDefined(johnHolding);
      assert.equal(johnHolding["is-frozen"], true);

      // unfreeze
      TXN_OBJ.apaa = [Buffer.from(new Uint8Array([0]))];
      assert.doesNotThrow(() => executeTEAL(freeze));

      // verify unfreeze
      johnHolding = interpreter.runtime.getAssetHolding(createdAssetID, johnAddr);
      assert.equal(johnHolding["is-frozen"], false);
    });
  });

  describe("Log", () => {
    it(`should log bytes to current transaction receipt`, function () {
      const txnInfo = interpreter.runtime.getTxReceipt(TXN_OBJ.txID);
      assert.isUndefined(txnInfo?.logs); // no logs before

      const log = `#pragma version 5
        int 1
        // log 30 times "a"
        loop:
        byte "a"
        log
        int 1
        +
        dup
        int 30
        <=
        bnz loop
        byte "b"
        log
        byte "c"
        log
      `;

      assert.doesNotThrow(() => executeTEAL(log));
      const logs = interpreter.runtime.getTxReceipt(TXN_OBJ.txID)?.logs as string[];
      assert.isDefined(logs);

      for (let i = 0; i < 30; ++i) { assert.equal(logs[i], "a"); }
      assert.equal(logs[30], "b");
      assert.equal(logs[31], "c");
    });

    it(`should throw error if log count exceeds threshold`, function () {
      const log = `#pragma version 5
        int 1
        // log 33 times "a" (exceeds threshold of 32)
        loop:
        byte "a"
        log
        int 1
        +
        dup
        int 33
        <=
        bnz loop
        byte "b"
        log
        byte "c"
        log
      `;

      expectRuntimeError(
        () => executeTEAL(log),
        RUNTIME_ERRORS.TEAL.LOGS_COUNT_EXCEEDED_THRESHOLD
      );
    });

    it(`should throw error if logs "length" exceeds threshold`, function () {
      const log = `#pragma version 5
        int 1
        // too long
        loop:
        byte "abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd"
        log
        int 1
        +
        dup
        int 30
        <=
        bnz loop
        byte "b"
        log
        byte "c"
        log
      `;

      expectRuntimeError(
        () => executeTEAL(log),
        RUNTIME_ERRORS.TEAL.LOGS_LENGTH_EXCEEDED_THRESHOLD
      );
    });
  });
});
