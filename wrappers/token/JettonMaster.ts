import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleBuilder,
} from '@ton/core';
import { packTokenContent } from '../../scripts/common/utils';

export type JettonMasterConfig = {
    adminAddress: Address;
    content: Cell;
    jettonWalletCode: Cell;
};

export type AmountType = 'n' | 'n-of-total' | '%';
export type RenderType = 'currency' | 'game';

export type JettonContent = {
    name?: string;
    description?: string;
    uri?: string;
    image?: string;
    imageData?: string;
    symbol?: string;
    decimals?: string;
    amountType?: AmountType;
    renderType?: RenderType;
}

export function buildJettonContent(content: JettonContent): Cell {
    return packTokenContent(content);
}

export function jettonMasterConfigToCell(config: JettonMasterConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.jettonWalletCode)
    .endCell();
}

export const Opcodes = {
    mint: 21,
    changeAdmin: 3,
    changeContent: 4
};

export class JettonMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    static createFromConfig(config: JettonMasterConfig, code: Cell, workchain = 0) {
        const data = jettonMasterConfigToCell(config);
        const init = { code, data };
        return new JettonMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: bigint;
            toAddress: Address;
            tonForWallet: bigint;
            forwardTonAmount?: bigint;
            jettonAmount: bigint;
            responseAddress?: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.mint, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeAddress(opts.toAddress)
                .storeCoins(opts.tonForWallet)
                .storeRef(
                    beginCell()
                        .storeUint(0x178d4519, 32)
                        .storeUint(opts.queryId ?? 0, 64)
                        .storeCoins(opts.jettonAmount)
                        .storeAddress(null)
                        .storeAddress(opts.responseAddress)
                        .storeCoins(opts.forwardTonAmount ?? 0)
                    .endCell()
                )
            .endCell(),
        });
    }

    async getJettonData(provider: ContractProvider) {
        const result = await provider.get('get_jetton_data', []);

        const jettonData = {} as any;
        jettonData["totalSupply"] = result.stack.readBigNumber();
        result.stack.pop()
        jettonData["adminAddress"] = result.stack.readAddress();
        jettonData["content"] = result.stack.readCell();
        jettonData["jettonWalletCode"] = result.stack.readCell();
        return jettonData;
    }

    async getWalletAddress(provider: ContractProvider, ownerAddress: Address) {
        const stack = new TupleBuilder();
        stack.writeAddress(ownerAddress);
        const result = await provider.get('get_wallet_address', stack.build());

        return result.stack.readAddress();
    }
}