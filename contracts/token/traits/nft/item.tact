import "../common/nft_common";
import "./messages";


trait NftItem {
    virtual const MIN_TONS_FOR_STORAGE: Int = ton("0.03");
    virtual const TRANSFER_FEE: Int = ton("0.01");
    virtual const SETUP_FEE: Int = ton("0.01");

    // Storage

    isInitialized: Bool = false;
    index: Int; // uint256
    collection: Address;
    owner: Address;

    /*

    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);
    }

    */

    // Receivers

    receive(msg: Setup) {
        self.requireForSetup(msg);

        self.owner = msg.owner;

        self.setupCustom(msg);

        self.isInitialized = true;

        nativeReserve(self.MIN_TONS_FOR_STORAGE, 0);

        send(self.setupResponseParams(msg));
    }

    receive(msg: Transfer) {
        let ctx: Context = context();
        let storageFee: Int = self.calculateStorageFee(ctx.value);
        self.requireForTransfer(ctx, msg, storageFee);
        self.transfer(msg, storageFee);
    }

    receive(msg: GetStaticData) {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: ReportStaticData{
                queryId: msg.queryId,
                index: self.index,
                collection: self.collection
            }.toCell()
        });
    }

    // Getters

    get fun get_nft_data(): NftData {
        return self.getNftData();
    }

    get fun get_owner(): Address {
        return self.owner;
    }

    get fun get_storage_fee(): Int {
        return self.calculateStorageFee(0);
    }

    // Access

    inline fun requireInitialized() {
        require(self.isInitialized, "Not initialized");
    }

    inline fun requireOwner() {
        require(sender() == self.owner, "Only owner");
    }

    inline fun requireCollection() {
        require(sender() == self.collection, "Only collection");
    }

    virtual inline fun requireForSetup(msg: Setup) {
        self.requireCollection();

        if (self.isInitialized) {
            send(SendParameters{
                to: msg.responseDestination,
                value: 0,
                mode: SendRemainingValue,
                bounce: false,
                body: MintFailed{
                    queryId: msg.queryId,
                    index: self.index,
                    owner: msg.owner
                }.toCell()
            });
            throw(0);
        }
        let ctx: Context = context();
        require(
            ctx.value > 
            ctx.readForwardFee() + 
            self.SETUP_FEE + 
            self.MIN_TONS_FOR_STORAGE,
            "Not enough TON"
        );
    }

    virtual inline fun requireForTransfer(ctx: Context, msg: Transfer, storageFee: Int) {
        self.requireInitialized();
        self.requireOwner();

        let numFwdActions: Int = 1;
        if (msg.forwardAmount > 0) {
            numFwdActions = numFwdActions + 1;
        }

        require(
            ctx.value > 
            numFwdActions * ctx.readForwardFee() +
            storageFee +
            self.TRANSFER_FEE,
            "Not enough TON"
        );
    }

    // Methods

    fun getNftData(): NftData {
        return NftData{
            isInitialized: self.isInitialized,
            index: self.index,
            collectionAddress: self.collection,
            ownerAddress: self.owner,
            individualContent: self.getIndividualContent()
        };
    }

    virtual inline fun setupResponseParams(msg: Setup): SendParameters {
        return SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: SendRemainingBalance,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        };
    }

    virtual inline fun transfer(msg: Transfer, storageFee: Int) {
        if (msg.forwardAmount > 0) {
            send(SendParameters{
                to: msg.newOwner,
                value: msg.forwardAmount,
                mode: SendPayGasSeparately,
                bounce: false,
                body: OwnershipAssigned{
                    queryId: msg.queryId,
                    prevOwner: self.owner,
                    forwardPayload: msg.forwardPayload
                }.toCell() 
            });
        }

        self.owner = msg.newOwner;

        let mode: Int = SendRemainingValue;
        if (storageFee > 0) {
            mode = SendRemainingBalance;
            nativeReserve(self.MIN_TONS_FOR_STORAGE, 0);
        }

        send(SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: mode,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    virtual inline fun calculateStorageFee(msgValue: Int): Int {
        return self.MIN_TONS_FOR_STORAGE - min(myBalance() - msgValue, self.MIN_TONS_FOR_STORAGE);
    }

    abstract inline fun setupCustom(msg: Setup);

    abstract inline fun getIndividualContent(): Cell;
}