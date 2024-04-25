import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot } from '@ton/sandbox';
import { beginCell, toNano } from '@ton/core';
import { Vesting } from '../wrappers/protocol/Vesting';
import { JettonMaster, buildJettonContent } from '../wrappers/token/JettonMaster';
import { JettonWallet } from '../wrappers/token/JettonWallet';
import { JETTON_MINTER_CODE_HEX, JETTON_WALLET_CODE_HEX } from '../scripts/common/codeBase';
import { hexToCell } from '../scripts/common/utils'
import '@ton/test-utils';
import { randomInt } from 'crypto';

const TEST_JETTON_CONTENT = {
    'name': 'Test Jetton',
    'symbol': 'TEST'
};
const TON_FOR_WALLET = toNano('0.01');
const TREASURY_JETTON_BALANCE = toNano(10_000_000);
const VESTING_AMOUNT = TREASURY_JETTON_BALANCE / 2n;
const MIN_TONS_FOR_STORAGE = toNano('0.01');

const ONE_YEAR = 31536000n;

describe('Vesting', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMaster>;
    let jettonWallet: SandboxContract<JettonWallet>;
    let vesting: SandboxContract<Vesting>;
    let vestingWallet: SandboxContract<JettonWallet>;

    const snapStates = new Map<string, BlockchainSnapshot>;

    let getCurTime: () => number;
    let advanceTime: (time: number) => void;
    let calculateVested: () => Promise<bigint>;
    let claimable: () => Promise<bigint>;
    let loadSnapshot: (name: string) => void;

    function claimTest(iter: number) {
        it(`claim test #${iter}`, async () => {
            advanceTime(randomInt(
                Number((await vesting.getData()).endTime) - getCurTime()
            ));
            const expectedVested = await calculateVested();
            const deployerbalanceBefore = (await jettonWallet.getWalletData()).balance;
            const expectedReceived = await claimable();
    
            await vesting.send(
                deployer.getSender(),
                {
                    value: toNano('0.1')
                },
                {
                    $$type: 'ClaimVested',
                    queryId: 0n,
                }
            );
    
            expect((await vesting.getData()).claimed).toEqual(expectedVested);
            expect((await vestingWallet.getWalletData()).balance).toEqual(
                VESTING_AMOUNT - expectedVested
            );
            expect((await jettonWallet.getWalletData()).balance).toEqual(
                deployerbalanceBefore + expectedReceived
            );
        });
    }

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        jettonMinter = blockchain.openContract(JettonMaster.createFromConfig(
            {
                adminAddress: deployer.address,
                content: buildJettonContent(TEST_JETTON_CONTENT),
                jettonWalletCode: hexToCell(JETTON_WALLET_CODE_HEX)
            },
            hexToCell(JETTON_MINTER_CODE_HEX)
        ));

        vesting = blockchain.openContract(await Vesting.fromInit(deployer.address, jettonMinter.address));

        await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));

        jettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(deployer.address))
        );

        vestingWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(vesting.address))
        );

        jettonMinter.sendMint(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                queryId: 0n,
                toAddress: deployer.address,
                tonForWallet: TON_FOR_WALLET,
                jettonAmount: TREASURY_JETTON_BALANCE,
                responseAddress: deployer.address
            }
        );

        getCurTime = () => blockchain.now ?? Math.floor(Date.now() / 1000);
        advanceTime = (time: number) => {
            blockchain.now ?? (blockchain.now = getCurTime());
            blockchain.now += time;
        };
        calculateVested = async () => {
            const data = await vesting.getData();
            if (data.startTime < data.endTime) {
                return data.underlying * (BigInt(getCurTime()) - data.startTime) / (data.endTime - data.startTime);
            } else {
                return data.underlying;
            }
        };

        claimable = async () => {
            return await calculateVested() - (await vesting.getData()).claimed;
        };

        loadSnapshot = (name) => {
            const snapshot = snapStates.get(name);
            if (!snapshot) {
                throw new Error('Snapshot does not exist');
            }
            blockchain.loadFrom(snapshot);
        };
    });

    it('should revert if msg.value is not enough', async () => {
        snapStates.set('beforeDeploying', blockchain.snapshot());
        const deployResult = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.01'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            deploy: true,
            success: false,
            exitCode: 15304
        });
        loadSnapshot('beforeDeploying');
    });

    it('should deploy', async () => {
        const deployResult = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.06'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            deploy: true,
            success: true,
        });

        expect((await blockchain.getContract(vesting.address)).balance).toEqual(MIN_TONS_FOR_STORAGE);
    });

    it('TakeWalletAddress should revert if sender is not the minter', async () => {
        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'TakeWalletAddress',
                queryId: 0n,
                walletAddress: vestingWallet.address,
                ownerAddress: beginCell().endCell()
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            success: false,
            exitCode: 4429
        });
    });

    it('TransferNotification should revert if sender is not the wallet', async () => {
        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'TransferNotification',
                queryId: 0n,
                amount: VESTING_AMOUNT,
                sender: deployer.address,
                forwardPayload: beginCell().endCell()
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            success: false,
            exitCode: 36088
        });
    });

    it('should receive underlying', async () => {
        const receipt = await jettonWallet.sendTransfer(
            deployer.getSender(),
            {
                value: toNano('0.1'),
                queryId: 0n,
                amount: VESTING_AMOUNT,
                destination: vesting.address,
                responseDestination: deployer.address,
                forwardTonAmount: toNano('0.02') // Necessary to notify vesting contract
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: await jettonMinter.getWalletAddress(vesting.address),
            to: vesting.address,
            success: true
        });

        expect((await vesting.getData()).underlying).toEqual(VESTING_AMOUNT);
        expect((await vestingWallet.getWalletData()).balance).toEqual(VESTING_AMOUNT);
    });

    it('StartVesting should revert if sender is not deployer', async () => {
        const newWallet = await blockchain.treasury('newWallet');
        const currTime = BigInt(getCurTime());
        const receipt = await vesting.send(
            newWallet.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'StartVesting',
                queryId: 0n,
                startTime: currTime,
                endTime: currTime + ONE_YEAR
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: newWallet.address,
            to: vesting.address,
            success: false,
            exitCode: 50433
        });
    });

    it('StartVesting should revert if startTime >= endTime', async () => {
        const currTime = BigInt(getCurTime());
        const randomDecrement = BigInt(randomInt(getCurTime()) + 1);
        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'StartVesting',
                queryId: 0n,
                startTime: currTime,
                endTime: currTime - randomDecrement
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            success: false,
            exitCode: 61720
        });
    });

    it('should start vesting', async () => {
        const currTime = BigInt(getCurTime());
        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'StartVesting',
                queryId: 0n,
                startTime: currTime,
                endTime: currTime + ONE_YEAR
            }
        );

        expect((await vesting.getData()).startTime).toEqual(currTime);
        expect((await vesting.getData()).endTime).toEqual(currTime + ONE_YEAR);
        expect(await vesting.getIsActive()).toBeTruthy();
    });

    it('StartVesting should revert if vesting already active', async () => {
        const currTime = BigInt(getCurTime());
        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'StartVesting',
                queryId: 0n,
                startTime: currTime,
                endTime: currTime + ONE_YEAR
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: vesting.address,
            success: false,
            exitCode: 42093
        });
    });

    it('ClaimVested should revert if sender is not owner', async () => {
        const newWallet = await blockchain.treasury('newWallet');
        const receipt = await vesting.send(
            newWallet.getSender(),
            {
                value: toNano('0.1')
            },
            {
                $$type: 'ClaimVested',
                queryId: 0n,
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: newWallet.address,
            to: vesting.address,
            success: false,
            exitCode: 132
        });
    });

    [...Array(100).keys()].forEach(iter => claimTest(iter));

    it('should claim all underlying after vesting is over', async () => {
        const data = await vesting.getData();
        const remainder = data.underlying - data.claimed;
        advanceTime(Number(data.endTime) - getCurTime());

        const receipt = await vesting.send(
            deployer.getSender(),
            {
                value: toNano('0.1')
            },
            {
                $$type: 'ClaimVested',
                queryId: 0n,
            }
        );

        expect((await vesting.getData()).claimed).toEqual(data.underlying);
        expect((await jettonWallet.getWalletData()).balance).toEqual(TREASURY_JETTON_BALANCE);

    });
});
