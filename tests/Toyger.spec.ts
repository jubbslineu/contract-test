import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot, EventMessageSent } from '@ton/sandbox';
import { beginCell, toNano, Cell, Address, Dictionary  } from '@ton/core';
import { ToygerCollection } from '../wrappers/token/ToygerCollection';
import { ToygerItem } from '../wrappers/token/ToygerItem';
import { MessageBouncer } from '../wrappers/mocks/MessageBouncer';
import '@ton/test-utils';
import { sha256_sync } from '@ton/crypto';

const COLLECTION_URL = 'ipfs://<cid_collection>/';
const ITEM_URL = 'ipfs://<cid_item>/';

const ITEM_ID = 0n;

const SETUP_SLICE_BITS = 40;
const SERIE = 1n;
const UNIT = 1n;
const TOTAL_SUPPLY = 100n;

const formatOffchainContent = (url: string): Cell => {
    return beginCell()
        .storeUint(1, 32)
        .storeStringTail(url)
    .endCell();
}

const getToygerNameTailString = (
    serie: bigint = SERIE,
    unit: bigint = UNIT,
    totalSupply: bigint = TOTAL_SUPPLY
): Cell => {
    return beginCell()
        .storeUint(0n, 8)
        .storeStringTail(`Toyger Serie ${serie} Unit ${unit}/${totalSupply}`)
    .endCell();
}


describe("Toyger Collection & Item", () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let toygerCollection: SandboxContract<ToygerCollection>;
    let toygerItem: SandboxContract<ToygerItem>;
    let messageBouncer: SandboxContract<MessageBouncer>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        toygerCollection = blockchain.openContract(
            await ToygerCollection.fromInit(formatOffchainContent(COLLECTION_URL))
        );

        await toygerCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'DeployCollection',
                queryId: 0n,
                owner: deployer.address,
                minter: deployer.address
            }
        );

        toygerItem = blockchain.openContract(
            ToygerItem.fromAddress(
                await toygerCollection.getGetNftAddressByIndex(ITEM_ID)
            )
        );

        messageBouncer = blockchain.openContract(
            await MessageBouncer.fromInit()
        );

        await messageBouncer.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'Deploy',
                queryId: 0n
            }
        );
    });

    describe('Toyger Collection', () => {
        it('Mint (FAIL): If sender is not minter, revert with "Not minter" message', async () => {
            const notMinter = await blockchain.treasury('notMinter');
    
            const receipt = await toygerCollection.send(
                notMinter.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: notMinter.address,
                    responseDestination: notMinter.address,
                    customPayload: beginCell().endCell()
                }
            );
    
            expect(receipt.transactions).toHaveTransaction({
                from: notMinter.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 61597
            });
        });
    
        it('Mint (FAIL): If TON is not enough, revert with "Not enough TON for Mint" message', async () => {
            const receipt = await toygerCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell().endCell()
                }
            );
    
            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 45600
            });
        });
    
        it('Mint (FAIL): If SetupPayload format is not correct, revert with "Setup data missing" message', async () => {
            let receipt = await toygerCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.12')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell().endCell()
                }
            );
    
            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 46719
            });
    
            receipt = await toygerCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.12')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell().storeUint(1, SETUP_SLICE_BITS).endCell()
                }
            );
    
            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 46719
            });
        });

        it('Mint (FAIL): If SetupPayload data is not of a valid range, revert with "Invalid params"', async () => {
            let receipt = await toygerCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.12')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell()
                        .storeUint(SERIE, 8)
                        .storeUint(0, 16)
                        .storeUint(TOTAL_SUPPLY, 16)
                        .storeStringRefTail(ITEM_URL)
                    .endCell()
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 35638
            });

            receipt = await toygerCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.12')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell()
                        .storeUint(SERIE, 8)
                        .storeUint(UNIT, 16)
                        .storeUint(0, 16)
                        .storeStringRefTail(ITEM_URL)
                    .endCell()
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toygerCollection.address,
                success: false,
                exitCode: 35638
            });
        });
    });

    it('Mint (SUCCESS) & Setup (FAIL): Should destroy', async () => {
        const receipt = await toygerCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.12')
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                index: ITEM_ID,
                owner: deployer.address,
                responseDestination: messageBouncer.address,
                customPayload: beginCell()
                    .storeUint(SERIE, 8)
                    .storeUint(UNIT, 16)
                    .storeUint(TOTAL_SUPPLY, 16)
                    .storeStringRefTail(ITEM_URL)
                .endCell()
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: messageBouncer.address,
            to: toygerItem.address,
            inMessageBounced: true
        });

        expect(receipt.transactions).toHaveTransaction({
            from: toygerItem.address,
            to: deployer.address,
            body: beginCell()
                .storeUint(0xd53276db, 32)
                .storeUint(0n, 64)
            .endCell()
        });

        const toygerItemMetadata = await blockchain.getContract(toygerItem.address);
        expect(toygerItemMetadata.balance).toEqual(0n);
        expect(toygerItemMetadata.accountState).toBeUndefined();
    })

    it('Mint (SUCCESS) & Setup (SUCCESS): Should send "DeploySuccessful" message to responseDestination', async () => {
        const receipt = await toygerCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.12')
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                index: ITEM_ID,
                owner: deployer.address,
                responseDestination: deployer.address,
                customPayload: beginCell()
                    .storeUint(SERIE, 8)
                    .storeUint(UNIT, 16)
                    .storeUint(TOTAL_SUPPLY, 16)
                    .storeStringRefTail(ITEM_URL)
                .endCell()
            }
        );

        const deploySuccessfulBody = (<EventMessageSent>receipt.events.at(-1)).body;

        expect(deploySuccessfulBody).toEqualCell(beginCell()
            .storeUint(0x6974ca9a, 32)
            .storeUint(0n, 64)
            .storeUint(ITEM_ID, 256)
            .storeAddress(deployer.address)
        .endCell());
    });


    it('Check Toyger data', async () => {
        const toygerIndividualContent = (await toygerItem.getGetNftData()).individualContent;

        const toygerContent = await toygerCollection.getGetNftContent(ITEM_ID, toygerIndividualContent);

        const contentDict = Dictionary.empty(
            Dictionary.Keys.Buffer(32),
            Dictionary.Values.Cell()
        );
        contentDict.set(sha256_sync('name'), getToygerNameTailString());
        contentDict.set(sha256_sync('url'), beginCell()
            .storeUint(0n, 8)
            .storeStringTail(ITEM_URL)
        .endCell());

        
        expect(toygerContent).toEqualCell(beginCell()
            .storeUint(0n, 32)
            .storeDict(contentDict)
        .endCell());
    });

    
});