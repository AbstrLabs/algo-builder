const { executeTransaction, convert } = require('@algo-builder/algob');
const { types } = require('@algo-builder/web');

async function run (runtimeEnv, deployer) {
  const masterAccount = deployer.accountsByName.get('master-account');
  const creatorAccount = deployer.accountsByName.get('alice');

  await executeTransaction(deployer, {
    type: types.TransactionType.TransferAlgo,
    sign: types.SignType.SecretKey,
    fromAccount: masterAccount,
    toAccountAddr: creatorAccount.addr,
    amountMicroAlgos: 5000000,
    payFlags: {}
  });

  const appArgs = [convert.stringToBytes('claim')];
  const appInfo = deployer.getApp('crowdFundApproval.teal', 'crowdFundClear.teal'); // get from checkpoint
  const escrowAccount = await deployer.loadLogic('crowdFundEscrow.py', { APP_ID: appInfo.appID });

  // Atomic Transaction (Stateful Smart Contract call + Payment Transaction)
  const txGroup = [
    {
      type: types.TransactionType.CallApp,
      sign: types.SignType.SecretKey,
      fromAccount: creatorAccount,
      appID: appInfo.appID,
      payFlags: {},
      appArgs: appArgs
    },
    {
      type: types.TransactionType.TransferAlgo,
      sign: types.SignType.LogicSignature,
      fromAccountAddr: escrowAccount.address(),
      toAccountAddr: creatorAccount.addr,
      amountMicroAlgos: 0,
      lsig: escrowAccount,
      payFlags: { closeRemainderTo: creatorAccount.addr }
    }
  ];

  console.log('Claim transaction in process');
  await executeTransaction(deployer, txGroup);
  console.log('Claimed!');
}

module.exports = { default: run };
