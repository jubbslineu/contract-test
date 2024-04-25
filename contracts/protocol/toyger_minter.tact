import "@stdlib/deploy";
import "@stdlib/ownable";
import "../token/toybuilder/item";
import "../token/toyger/item";

message Pause {
    queryId: Int as uint64;
    pause: Bool;
}

message DeployMinter {
    queryId: Int as uint64;
    owner: Address;
}

message DeployMinterOk {
    queryId: Int as uint64;
}

message DestroyMinter {
    queryId: Int as uint64;
}

message DestroyMinterOk {
    queryId: Int as uint64;
}

message SetIntermediaryPath {
    queryId: Int as uint64;
    intermediaryPath: Address?;
}

struct MintData {
    serie: Int as uint8;
    toygerCollection: Address;
    toyBuilderCollection: Address;
    intermediaryPath: Address?;
    startIndex: Int as uint32;
    numOfItems: Int as uint16;
    url: Cell;
    soldMap: map<Int as uint16, Cell>;
}

contract ToygerMinter with Deployable, OwnableTransferable {
    const MIN_TON_FOR_STORAGE: Int = ton("0.03");
    const MINT_FEE: Int = ton("0.2");

    // Storage
    
    owner: Address;
    mintData: MintData;
    isPaused: Bool = false;
    isInitialized: Bool = false;

    init(
        toygerCollection: Address,
        toyBuilderCollection: Address,
        serie: Int,
        startIndex: Int,
        numOfItems: Int,
        url: Cell
    ) {

        self.owner = newAddress(0, 0);
        self.mintData = MintData{
            serie: serie,
            toygerCollection: toygerCollection,
            toyBuilderCollection: toyBuilderCollection,
            intermediaryPath: newAddress(0, 0),
            startIndex: startIndex,
            numOfItems: numOfItems,
            url: url,
            soldMap: emptyMap()
        };
    }

    // Receivers

    receive(msg: DeployMinter) {
        require(!self.isInitialized, "Already initialized");

        self.isInitialized = true;
        self.owner = msg.owner;

        nativeReserve(self.MIN_TON_FOR_STORAGE, 0);

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingBalance,
            bounce: false,
            body: DeployMinterOk{ queryId: msg.queryId}.toCell()
        });
    }

    receive(msg: SetIntermediaryPath) {
        self.requireOwner();

        self.mintData.intermediaryPath = msg.intermediaryPath;

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: Pause) {
        self.requireOwner();

        self.isPaused = msg.pause;

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: DestroyMinter) {
        self.requireForDestroy();

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            bounce: false,
            body: DestroyMinterOk{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: MintToyger) {
        self.requireForMintToyger(msg);

        let dest: Address = self.mintData.toygerCollection;
        if (self.mintData.intermediaryPath != null) {
            dest = self.mintData.intermediaryPath!!;
        }

        let unit: Int = msg.toygerId - self.mintData.startIndex + 1;
        
        let isMinted: Bool = self.checkIfMinted(unit, true);
        require(!isMinted, "Toyger already minted");

        let toygerData: ToygerData = ToygerData{
            serie: self.mintData.serie,
            unit: unit,
            totalSupply: self.mintData.numOfItems,
            url: self.mintData.url
        };

        send(SendParameters{
            to: dest,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Mint{
                queryId: msg.queryId,
                index: msg.toygerId,
                owner: sender(),
                responseDestination: myAddress(),
                customPayload: toygerData.toCell()
            }.toCell()
        });
    }

    receive(msg: DeploySuccessful) {
        self.requireForDeploySuccessful(msg);

        send(SendParameters{
            to: msg.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: MintToygerSucceeded{
                queryId: msg.queryId,
                toygerAddress: sender()
            }.toCell()
        });
    }

    // Getters

    get fun get_mint_data(): MintData {
        return self.mintData;
    }

    get fun is_minted(unit: Int): Bool {
        return self.checkIfMinted(unit, false);
    }

    get fun get_item_id(unit: Int): Int {
        return unit + self.mintData.startIndex - 1;
    }

    get fun get_unit_id(item_id: Int): Int {
        return item_id - self.mintData.startIndex + 1;
    }


    // Access

    inline fun requireNotPaused() {
        require(!self.isPaused, "Paused");
    }

    inline fun requireForDestroy() {
        self.requireOwner();
        require(self.isPaused, "Not Paused");
    }

    inline fun requireForMintToyger(msg: MintToyger) {
        require(
            sender() == self.getToyBuilderAddressByIndex(msg.toyBuilderId),
            "Only ToyBuilder"
        );
        require(context().value >= self.MINT_FEE, "Not enough TON for mint");
        self.requireNotPaused();
        require(
            msg.toygerId >= self.mintData.startIndex &&
            msg.toygerId < self.mintData.startIndex + self.mintData.numOfItems,
            "Invalid Toyger ID"
        );
    }

    inline fun requireForDeploySuccessful(msg: DeploySuccessful) {
        require(sender() == self.getToygerAddressByIndex(msg.index), "Only Toyger");
    }

    // Methods

    inline fun getToygerAddressByIndex(index: Int): Address {
        return contractAddress(initOf ToygerItem(self.mintData.toygerCollection, index));
    }

    inline fun getToyBuilderAddressByIndex(index: Int): Address {
        return contractAddress(initOf ToyBuilderItem(self.mintData.toyBuilderCollection, index));
    }

    fun checkIfMinted(unit: Int, checkMinted: Bool): Bool {
        let mapIndex: Int = unit / 1023;
        let bitIndex: Int = unit % 1023;

        let mapCell: Cell? = self.mintData.soldMap.get(mapIndex);
        if (mapCell == null) {
            if (checkMinted) {
                self.mintData.soldMap.set(mapIndex, beginCell()
                    .storeUint(0, bitIndex)
                    .storeBool(true)
                .endCell());
            }
            return false;
        }

        let mapSlice: Slice = (mapCell!!).beginParse();

        if (mapSlice.bits() < bitIndex + 1) {
            if (checkMinted) {
                self.mintData.soldMap.set(mapIndex, beginCell()
                    .storeSlice(mapSlice)
                    .storeUint(0, bitIndex - mapSlice.bits())
                    .storeBool(true)
                .endCell());
            }
            return false;
        }

        let padding: Slice = mapSlice.loadBits(bitIndex);
        let flag: Bool = mapSlice.loadInt(1) == -1;
        if (!flag && checkMinted) {
            self.mintData.soldMap.set(mapIndex, beginCell()
                .storeSlice(padding)
                .storeBool(true)
                .storeSlice(mapSlice)
            .endCell());
        }

        return flag;
    }

    fun uncheckMinted(unit: Int) {
        let mapIndex: Int = unit / 1023;
        let bitIndex: Int = unit % 1023;

        let mapCell: Cell? = self.mintData.soldMap.get(mapIndex);
    }
}