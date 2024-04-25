import "../traits/nft/item";
import "./messages";

struct ToygerData {
    serie: Int as uint8;
    unit: Int as uint16;
    totalSupply: Int as uint16;
    url: Cell;
}

contract ToygerItem with NftItem {
    // Storage

    isInitialized: Bool = false;
    index: Int as uint256;
    collection: Address;
    owner: Address;
    data: ToygerData;

    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);

        self.data = ToygerData{
            serie: 0,
            unit: 0,
            totalSupply: 0,
            url: emptyCell()
        };
    }

    // Methods

    override inline fun setupResponseParams(msg: Setup): SendParameters {
        return SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: SendRemainingBalance,
            bounce: true,
            body: DeploySuccessful{
                queryId: msg.queryId,
                index: self.index,
                owner: self.owner
            }.toCell()
        };
    }

    bounced(src: bounced<DeploySuccessful>) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
            bounce: false,
            body: Excesses{ queryId: src.queryId }.toCell()
        });
    }

    override inline fun setupCustom(msg: Setup) {
        let setupSlice: Slice = (msg.customPayload!!).beginParse();

        self.data.serie = setupSlice.loadUint(8);
        self.data.unit = setupSlice.loadUint(16);
        self.data.totalSupply = setupSlice.loadUint(16);
        self.data.url = setupSlice.loadRef();
    }

    override inline fun getIndividualContent(): Cell {
        return self.data.toCell();
    }
}