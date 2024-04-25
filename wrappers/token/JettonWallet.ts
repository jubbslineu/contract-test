import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type JettonWalletConfig = {
    ownerAddress: Address;
    jettonMasterAddress: Address;
};

export function JettonWalletConfigToCell(config: JettonWalletConfig, code: Cell): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(code)
    .endCell();
}

export const Opcodes = {
    transfer: 0xf8a7ea5,
    burn: 0x595f07bc
};

export class JettonWallet implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = JettonWalletConfigToCell(config, code);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: bigint;
            amount: bigint;
            destination: Address;
            responseDestination: Address;
            customPayload?: Cell;
            forwardTonAmount?: bigint;
            forwardPayload?: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.transfer, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeCoins(opts.amount)
                .storeAddress(opts.destination)
                .storeAddress(opts.responseDestination)
                .storeMaybeRef(opts.customPayload)
                .storeCoins(opts.forwardTonAmount ?? 0)
                .storeMaybeRef(opts.forwardPayload)
            .endCell(),
        });
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            amount: bigint;
            responseDestination: Address;
            customPayload?: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.burn, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeCoins(opts.amount)
                .storeAddress(opts.responseDestination)
                .storeMaybeRef(opts.customPayload)
            .endCell(),
        });
    }

    async getWalletData(provider: ContractProvider) {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: result.stack.readBigNumber(),
            ownerAddress: result.stack.readAddress(),
            jettonMasterAddress: result.stack.readAddress(),
            jettonWalletCode: result.stack.readCell()
        }
    }
}