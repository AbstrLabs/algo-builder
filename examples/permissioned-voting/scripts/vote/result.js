const { readAppGlobalState } = require('@algo-builder/algob');
const { types } = require('@algo-builder/web');
const { executeTransaction } = require('./common');

async function run (runtimeEnv, deployer) {
  const votingAdminAccount = deployer.accountsByName.get('john');
  const alice = deployer.accountsByName.get('alice');

  // Retreive AppInfo from checkpoints.
  const appInfo = deployer.getApp('permissioned-voting-approval.py', 'permissioned-voting-clear.py');

  // Retreive Global State
  const globalState = await readAppGlobalState(deployer, votingAdminAccount.addr, appInfo.appID);
  console.log(globalState);

  // Count votes
  const candidateA = globalState.get('candidatea') ?? 0;
  const candidateB = globalState.get('candidateb') ?? 0;

  // Declare Winner
  if (candidateA > candidateB) {
    console.log('The Winner is CandidateA!!');
  } else if (candidateA === candidateB) {
    console.log('Election Result is a tie.');
  } else {
    console.log('The Winner is CandidateA!!');
  }

  const txnParam = {
    type: types.TransactionType.DeleteApp,
    sign: types.SignType.SecretKey,
    fromAccount: votingAdminAccount,
    appID: appInfo.appID,
    payFlags: {}
  };

  // Delete Application
  console.log('Deleting Application');
  await executeTransaction(deployer, txnParam);

  txnParam.fromAccount = alice;
  txnParam.type = types.TransactionType.ClearApp;

  // Clear voter's account
  console.log("Clearing Alice's Account");
  await executeTransaction(deployer, txnParam);
}

module.exports = { default: run };
