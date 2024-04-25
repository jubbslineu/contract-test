import "../common/nft_messages_common";

// Collection

message(0x693d3950) GetRoyaltyParams {
    queryId: Int as uint64;
}

message(0xa8cb00ad) ReportRoyaltyParams {
    queryId: Int as uint64;
    numerator: Int as uint16;
    denominator: Int as uint16;
    destination: Address;
}

message(0x762ca06b) ConfigRoyalty {
    queryId: Int as uint64;
    numerator: Int as uint16;
    denominator: Int as uint16;
}

message(0x33a94ccf) ChangeRoyaltyDestination {
    queryId: Int as uint64;
    destination: Address;
}

// Item

message(0x5fcc3d14) Transfer {
    queryId: Int as uint64;
    newOwner: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardAmount: Int as coins;
    forwardPayload: Slice as remaining;
}
