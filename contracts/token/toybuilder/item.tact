import "../traits/sbt/item";
import "./messages";

struct ToyBuilderData {
    generation: Int as uint8;
    serie: Int as uint8;
    buildCredits: Int as uint8;
    buildTime: Int as uint32;
    buildStart: Int as uint64;
    awaitingResponseFrom: Address?;
    url: Cell;
}

struct ProofData {
    index: Int as uint256;
    toyBuilderData: ToyBuilderData;
    forwardPayload: Cell?;
}

contract ToyBuilderItem with SbtItem {
    const BUILD_FEE: Int = ton("0.3");

    // Storage

    isInitialized: Bool = false;
    index: Int as uint256;
    collection: Address;
    owner: Address;
    authority: Address;
    revokedAt: Int as uint64 = 0;
    data: ToyBuilderData;

    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);
        self.authority = collection;

        // Set ToyBuilderData
        self.data = ToyBuilderData {
            generation: 0,
            serie: 0,
            buildCredits: 0,
            buildTime: 0,
            buildStart: 0,
            awaitingResponseFrom: null,
            url: emptyCell()
        };
    }

    // Receivers

    receive(msg: BuildToyger) {
        self.requireForBuildToyger();

        self.data.awaitingResponseFrom = msg.toygerMinter;

        send(SendParameters{
            to: msg.toygerMinter,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: MintToyger{
                queryId: msg.queryId,
                toyBuilderId: self.index,
                toygerId: msg.itemId
            }.toCell()
        });
    }

    receive(msg: MintToygerSucceeded) {
        self.requireResponseSource();

        self.data.awaitingResponseFrom = msg.toygerAddress;
        self.data.buildCredits = self.data.buildCredits - 1;

        self.data.buildStart = now();

        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: ClaimToyger) {
       self.requireForClaimToyger();

       send(SendParameters{
            to: self.data.awaitingResponseFrom!!,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: Transfer{
                queryId: msg.queryId,
                newOwner: self.owner,
                responseDestination: myAddress(),
                customPayload: null,
                forwardAmount: 0,
                forwardPayload: emptySlice()
            }.toCell()
       });
    }

    receive(msg: Excesses) {

        if (self.data.awaitingResponseFrom != null) {
            self.requireResponseSource();
            
            self.data.awaitingResponseFrom = null;
            self.data.buildStart = 0;
        }

        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: msg.toCell()
        });
    }

    bounced(src: ClaimToyger) {         
        self.data.awaitingResponseFrom = null;
        self.data.buildStart = 0;
    }

    bounced(src: bounced<MintToyger>) {
        self.data.awaitingResponseFrom = null;

        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: MintToygerFailed{ queryId: src.queryId }.toCell()
        });
    }

    // Access

    inline fun requireResponseSource() {
        require(sender() == self.data.awaitingResponseFrom, "Invalid source");
    }

    inline fun requireForClaimToyger() {
        self.requireNotRevoked();
        self.requireOwner();
        require(self.data.buildStart > 0, "No toygers being built");
        require(self.data.buildStart + self.data.buildTime <= now(), "Build in progress");
    }

    inline fun requireForBuildToyger() {
        self.requireNotRevoked();
        self.requireNotAwaitingResponse();
        self.requireOwner();
    
        require(self.data.buildCredits > 0, "Build limit reached");
        require(context().value >= self.BUILD_FEE, "Not enough TON to build");
    }

    inline fun requireNotAwaitingResponse() {
        require(self.data.awaitingResponseFrom == null, "Awaiting response");
    }

    // Getters

    get fun get_toybuilder_data(): ToyBuilderData {
        return self.data;
    }
    

    // Methods

    override inline fun getIndividualContent(): Cell {
        return self.data.toCell();
    }

    override inline fun setupCustom(msg: Setup) {
        let setupSlice: Slice = (msg.customPayload!!).beginParse();
        self.data.generation = setupSlice.loadUint(8);
        self.data.serie = setupSlice.loadUint(8);
        self.data.buildCredits = setupSlice.loadUint(8);
        self.data.buildTime = setupSlice.loadUint(32);
        if (!setupSlice.dataEmpty()) {
            self.authority = setupSlice.loadAddress();
        }
        self.data.url = setupSlice.loadRef();
    }

    override inline fun buildData(forwardPayload: Cell): Cell {
        let data: ProofData = ProofData{
            index: self.index,
            toyBuilderData: self.data,
            forwardPayload: null
        };

        if (!forwardPayload.asSlice().empty()) {
            data.forwardPayload = forwardPayload;
        }

        return data.toCell();
    }
}