import "@stdlib/ownable";
import "./messages";

/////////// NFT Collection Trait

// Structs

struct CollectionData {
    nextItemIndex: Int;
    collectionContent: Cell;
    ownerAddress: Address;
}

trait NftCollection with OwnableTransferable {

    virtual const MIN_TONS_FOR_STORAGE: Int = ton("0.03");
    virtual const MINT_FEE: Int = ton("0.12");

    // Storage

    nextItemIndex: Int; // int256
    collectionContent: Cell;
    owner: Address;
    minter: Address;

    /*

    init(collectionContent: Cell, isSequential: Bool) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        if (isSequential) {
            self.nextItemIndex = 0;
        } else {
            self.nextItemIndex = -1;
        }
    }

    */

    // Receivers

    receive(msg: DeployCollection) {
        require(self.owner == newAddress(0, 0), "Already deployed");
        self.owner = msg.owner;
        self.minter = msg.minter;
        let ctx: Context = context();
        require(ctx.value > self.MIN_TONS_FOR_STORAGE, "Not enough TON");

        nativeReserve(self.MIN_TONS_FOR_STORAGE, 0);
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingBalance,
            body: DeployCollectionOk{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: ChangeMinter) {
        self.requireForChangeMinter(msg);
        self.minter = msg.minter;

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: Mint) {
        self.requireForMint(msg);
        self.deployNft(msg);
    }

    // Getters

    get fun get_collection_data(): CollectionData {
        return CollectionData {
            nextItemIndex: self.nextItemIndex,
            collectionContent: self.collectionContent,
            ownerAddress: self.owner
        };
    }

    get fun get_nft_address_by_index(index: Int): Address {
        return self.getNftAddressByIndex(index);
    }

    get fun get_nft_content(index: Int, individualContent: Cell): Cell {
        return self.getNftContent(index, individualContent);
    }

    get fun get_minter(): Address {
        return self.minter;
    }

    // Methods

    virtual inline fun requireForMint(msg: Mint) {
        require(sender() == self.minter, "Not minter");
        let ctx: Context = context();

        require(ctx.value >= self.MINT_FEE, "Not enough TON for Mint");
    }

    virtual inline fun requireForChangeMinter(msg: ChangeMinter) {
        self.requireOwner();
    }

    virtual inline fun deployNft(msg: Mint) {
        if (self.nextItemIndex >= 0) {
            msg.index = self.nextItemIndex;
            self.nextItemIndex = self.nextItemIndex + 1;
        }

        let stateInit: StateInit = self.getNftStateInit(myAddress(), msg.index);

        send(SendParameters{
            to: contractAddress(stateInit),
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            code: stateInit.code,
            data: stateInit.data,
            body: Setup {
                queryId: msg.queryId,
                owner: msg.owner,
                responseDestination: msg.responseDestination,
                customPayload: msg.customPayload
            }.toCell()
        });
    }

    fun getNftAddressByIndex(index: Int): Address {
        return contractAddress(self.getNftStateInit(myAddress(), index));
    }

    abstract inline fun getNftStateInit(collectionAddress: Address, index: Int): StateInit;

    abstract inline fun getNftContent(index: Int, individualContent: Cell): Cell;
}

/////////// NFT Collection Royalty Extension

// Structs

struct RoyaltyParams {
    numerator: Int;
    denominator: Int;
    destination: Address;
}

trait NftRoyaltiesExtension {

    // Storage

    nextItemIndex: Int; // int256
    collectionContent: Cell;
    owner: Address;
    minter: Address;
    royaltyNumerator: Int; // uint16
    royaltyDenominator: Int; // uint16
    royaltyDestination: Address;

    /*

    init(collectionContent: Cell, isSequential: Bool) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        if (isSequential) {
            self.nextItemIndex = 0;
        } else {
            self.nextItemIndex = -1;
        }
        self.royaltyNumerator = 0;
        self.royaltyDenominator = 0;
        self.royaltyDestination = newAddress(0, 0);
    }

    */

    // Receivers

    receive(msg: ConfigRoyalty) {
        self.requireConfigRoyalty(msg);
        self.royaltyNumerator = msg.numerator;
        self.royaltyDenominator = msg.denominator;
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: ChangeRoyaltyDestination) {
        self.requireChangeRoyaltyDestination(msg);
        self.royaltyDestination = msg.destination;
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: GetRoyaltyParams) {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: ReportRoyaltyParams{
                queryId: msg.queryId,
                numerator: self.royaltyNumerator,
                denominator: self.royaltyDenominator,
                destination: self.royaltyDestination
            }.toCell()
        });
    }

    // Getters

    get fun royalty_params(): RoyaltyParams {
        return self.getRoyaltyParams();
    }

    // Methods

    virtual inline fun requireConfigRoyalty(msg: ConfigRoyalty) {
        require(sender() == self.owner, "Only owner");
        require(msg.numerator <= msg.denominator, "Invalid royalty fee");
    }

    virtual inline fun requireChangeRoyaltyDestination(msg: ChangeRoyaltyDestination) {
        require(sender() == self.owner, "Only owner");
    }

    inline fun getRoyaltyParams(): RoyaltyParams {
        return RoyaltyParams {
            numerator: self.royaltyNumerator,
            denominator: self.royaltyDenominator,
            destination: self.royaltyDestination
        };
    }
}