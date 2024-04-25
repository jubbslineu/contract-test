// ToyBuilder Item

message(0x681f7960) BuildToyger {
    queryId: Int as uint64;
    itemId: Int as uint256;
    toygerMinter: Address;
}

message(0x4bb56f59) MintToyger {
    queryId: Int as uint64;
    toyBuilderId: Int as uint256;
    toygerId: Int as uint256;
}

message(0x8b1d876f) ClaimToyger {
    queryId: Int as uint64;
}

message(0xa1f22cc8) MintToygerSucceeded {
    queryId: Int as uint64;
    toygerAddress: Address;
}

message(0x489ded90) MintToygerFailed {
    queryId: Int as uint64;
}
