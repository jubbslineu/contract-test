
// Items that implements TEP-62
struct NftData {
    isInitialized: Bool;
    index: Int;
    collectionAddress: Address;
    ownerAddress: Address;
    individualContent: Cell;
}