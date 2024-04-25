import "@stdlib/deploy";
import "@stdlib/ownable";

message(0x2c76b973) ProvideWalletAddress {
    queryId: Int as uint64;
    ownerAddress: Address;
    includeAddress: Bool;
}

message(0xd1735400) TakeWalletAddress {
    queryId: Int as uint64;
    walletAddress: Address;
    ownerAddress: Slice as remaining;
}

message(0xf8a7ea5) Transfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x4bc5a1cc) StartVesting {
    queryId: Int as uint64;
    startTime: Int as uint32;
    endTime: Int as uint32;
}

message(0xad0da87e) ClaimVested {
    queryId: Int as uint64;
}

message(0xd3abe5d6) InitNotification {
    queryId: Int as uint64;
}

message(0xfc06ba07) FundsReceivedNotification {
    queryId: Int as uint64;
}

message(0x7362d09c) TransferNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
}

struct VestingData {
    owner: Address;
    deployer: Address;
    jettonMinter: Address;
    jettonWallet: Address;
    startTime: Int as uint32;
    endTime: Int as uint32;
    underlying: Int as coins;
    claimed: Int as coins;
    isActive: Bool;
}

fun linearVesting(startTime: Int, endTime: Int, assetAmount: Int): Int {
    if (startTime < endTime) {
        return assetAmount * (now() - startTime) / (endTime - startTime);
    } else {
        return assetAmount;
    }
}

fun claimable(startTime: Int, endTime: Int, assetAmount: Int, claimedAmount: Int): Int {
    return linearVesting(startTime, endTime, assetAmount) - claimedAmount;
}

contract Vesting with Deployable, Ownable {
    const GAS_CONSUMPTION: Int = ton("0.01");
    const MIN_TONS_FOR_STORAGE: Int = ton("0.01");
    const PROVIDE_ADDRESS_GAS_CONSUMPTION: Int = ton("0.01");

    owner: Address;
    deployer: Address;
    jettonMinter: Address;
    jettonWallet: Address;
    startTime: Int as uint32 = 0;
    endTime: Int as uint32 = 0;
    underlying: Int as coins = 0;
    claimed: Int as coins = 0;
    isActive: Bool = false;

    init(owner: Address, jettonMinter: Address) {
        let ctx: Context = context();
        require(
            ctx.value >= ctx.readForwardFee() + 
            self.PROVIDE_ADDRESS_GAS_CONSUMPTION + 
            self.MIN_TONS_FOR_STORAGE +
            self.GAS_CONSUMPTION,
            "Not enough TON"
        );
        self.owner = owner;
        self.deployer = sender();
        self.jettonMinter = jettonMinter;
        self.jettonWallet = newAddress(0, 0);

        nativeReserve(self.MIN_TONS_FOR_STORAGE, 0);

        send(SendParameters{
            to: self.jettonMinter,
            value: 0,
            mode: SendRemainingBalance,
            body: ProvideWalletAddress{queryId: now(), ownerAddress: myAddress(), includeAddress: false}.toCell()
        });
    }

    receive(msg: TakeWalletAddress) {
        require(sender() == self.jettonMinter, "Invalid sender");
        self.jettonWallet = msg.walletAddress;

        send(SendParameters{
            to: self.deployer,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: InitNotification{queryId: msg.queryId}.toCell()
        });
    }

    receive(msg: TransferNotification) {
        require(sender() == self.jettonWallet, "Invalid wallet");
        self.underlying = self.underlying + msg.amount;

        send(SendParameters{
            to: msg.sender,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: FundsReceivedNotification{queryId: msg.queryId}.toCell()
        });
    }

    receive(msg: StartVesting) {
        require(!self.isActive, "Active");
        require(sender() == self.deployer, "Only deployer");
        require(msg.startTime < msg.endTime, "startTime >= endTime");
        self.startTime = msg.startTime;
        self.endTime = msg.endTime;
        self.isActive = true;
        self.reply("Vesting started".asComment());
    }

    receive(msg: ClaimVested) {
        self.requireOwner();
        let ctx: Context = context();
        let storageFee: Int = self.MIN_TONS_FOR_STORAGE - min(myBalance() - ctx.value, self.MIN_TONS_FOR_STORAGE);
        require(
            ctx.value >= 3 * self.GAS_CONSUMPTION + 
            2 * ctx.readForwardFee() + 
            storageFee +
            self.MIN_TONS_FOR_STORAGE,
            "Not enough TON"
        );

        let mode: Int = SendRemainingValue;
        if (storageFee > 0) {
            mode = SendRemainingBalance;
            nativeReserve(self.MIN_TONS_FOR_STORAGE, 0);
        }

        let claimable: Int = claimable(self.startTime, self.endTime, self.underlying, self.claimed);

        self.claimed = self.claimed + claimable;
        send(SendParameters{
            to: self.jettonWallet,
            value: 0,
            mode: mode,
            body: Transfer{
                queryId: msg.queryId,
                amount: claimable,
                destination: self.owner,
                responseDestination: self.owner,
                customPayload: "Tokens claimed".asComment(),
                forwardTonAmount: 0,
                forwardPayload: beginCell().storeUint(1, 1).endCell().beginParse()
            }.toCell()
        });
    }

    bounced(src: bounced<Transfer>) {
        self.claimed = self.claimed - src.amount;
    }

    get fun totalVested(): Int {
        return linearVesting(self.startTime, self.endTime, self.underlying);
    }

    get fun claimable(): Int {
        return claimable(self.startTime, self.endTime, self.underlying, self.claimed);
    }

    get fun storageFee(): Int {
        return self.MIN_TONS_FOR_STORAGE - min(myBalance(), self.MIN_TONS_FOR_STORAGE);
    }

    get fun isActive(): Bool {
        return self.isActive;
    }

    get fun data(): VestingData {
        return VestingData {
            owner: self.owner,
            deployer: self.deployer,
            jettonMinter: self.jettonMinter,
            jettonWallet: self.jettonWallet,
            startTime: self.startTime,
            endTime: self.endTime,
            underlying: self.underlying,
            claimed: self.claimed,
            isActive: self.isActive
        };
    }
}
