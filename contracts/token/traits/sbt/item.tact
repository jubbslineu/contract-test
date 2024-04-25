import "../common/nft_common";
import "./messages";

trait SbtItem {

    virtual const MIN_TONS_FOR_STORAGE: Int = ton("0.03");
    virtual const TRANSFER_FEE: Int = ton("0.01");
    virtual const SETUP_FEE: Int = ton("0.01");

    // Storage

    isInitialized: Bool = false;
    index: Int; // uint256
    collection: Address;
    owner: Address;
    authority: Address;
    revokedAt: Int = 0; // uint64


    /*
    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);
        self.authority = collection;
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

    receive(msg: ChangeAuthority) {
        self.requireForChangeAuthority();

        self.authority = msg.newAuthority;

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: ProveOwnership) {
        self.requireForProveOwnership();

        let msgBody: OwnershipProof = OwnershipProof{
            queryId: msg.queryId,
            itemId: self.index,
            owner: self.owner,
            data: self.buildData(msg.forwardPayload),
            revokedAt: self.revokedAt,
            content: null
        };

        if (msg.withContent) {
            msgBody.content = self.getIndividualContent();
        }

        send(SendParameters{
            to: msg.dest,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: msgBody.toCell()
        });
    }

    receive(msg: RequestOwner) {
        self.requireForRequestOwner();

        let msgBody: OwnerInfo = OwnerInfo{
            queryId: msg.queryId,
            itemId: self.index,
            initiator: sender(),
            owner: self.owner,
            data: self.buildData(msg.forwardPayload),
            revokedAt: self.revokedAt,
            content: null
        };

        if (msg.withContent) {
            msgBody.content = self.getIndividualContent();
        }

        send(SendParameters{
            to: msg.dest,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: msgBody.toCell()
        });
    }

    receive(msg: Destroy) {
        self.requireForDestroy();

        self.destroy(msg);
    }

    receive(msg: Revoke) {
        self.requireForRevoke();

        self.revokedAt = now();

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    bounced(src: bounced<OwnershipProof>) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: ProveOwnershipFailed {
                queryId: src.queryId,
                failedReceiver: sender()
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

    get fun get_authority_address(): Address {
        return self.authority;
    }

    get fun get_revoked_time(): Int {
        return self.revokedAt;
    }

    // Access

    inline fun requireOwner() {
        require(sender() == self.owner, "Only owner");
    }

    virtual inline fun requireNotRevoked() {
        require(self.revokedAt == 0, "Revoked");
    }

    inline fun requireInitialized() {
        require(self.isInitialized, "Not initialized");
    }

    inline fun requireAuthority() {
        require(sender() == self.authority, "Only authority");
    }

    inline fun requireCollection() {
        require(sender() == self.collection, "Only collection");
    }

    virtual inline fun requireForDestroy() {
        self.requireOwner();
    }

    virtual inline fun requireForRevoke() {
        self.requireNotRevoked();
        self.requireAuthority();
    }

    virtual inline fun requireForRequestOwner() {
        self.requireInitialized();
        self.requireNotRevoked();
    }

    virtual inline fun requireForProveOwnership() {
        self.requireNotRevoked();
        self.requireOwner();
    }

    virtual inline fun requireForChangeAuthority() {
        self.requireAuthority();
    }

    virtual inline fun requireForSetup(msg: Setup) {
        self.requireCollection();
        if (self.isInitialized) {
            send(SendParameters{
                to: msg.responseDestination,
                value: 0,
                mode: SendRemainingValue,
                bounce: false,
                body: MintFailed {
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

    // Methods

    virtual inline fun setupResponseParams(msg: Setup): SendParameters {
        return SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: SendRemainingBalance,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        };
    }

    virtual inline fun destroy(msg: Destroy) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    virtual inline fun buildData(forwardPayload: Cell): Cell {
        return forwardPayload;
    }

    inline fun getNftData(): NftData {
        return NftData{
            isInitialized: self.isInitialized,
            index: self.index,
            collectionAddress: self.collection,
            ownerAddress: self.owner,
            individualContent: self.getIndividualContent()
        };
    }

    virtual inline fun calculateStorageFee(msgValue: Int): Int {
        return self.MIN_TONS_FOR_STORAGE - min(myBalance() - msgValue, self.MIN_TONS_FOR_STORAGE);
    }

    abstract inline fun setupCustom(msg: Setup);

    abstract inline fun getIndividualContent(): Cell;
}