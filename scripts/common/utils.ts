import { Cell, Dictionary, beginCell } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

type ContentDict = Dictionary<Buffer, Cell>;

interface TokenContent {
    [field: string]: string;
}

interface UnpackedContentResult {
    content: TokenContent;
    remainder: ContentDict;
    isRemainderEmpty: boolean;
}

export function camelToUnderscore(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function hexToCell(str: string): Cell {
    return Cell.fromBoc(Buffer.from(str.replace('0x', ''), 'hex'))[0];
}

export function packTokenContent(content: TokenContent): Cell {
    const encodedContent = beginCell().storeUint(0, 8);
    const contentDict = Dictionary.empty(
        Dictionary.Keys.Buffer(32),
        Dictionary.Values.Cell()
    );
    Object.entries(content).forEach(([key, value]) => {
        contentDict.set(
            sha256_sync(camelToUnderscore(key)),
            beginCell().storeUint(0, 8).storeStringTail(value).endCell()
        )
    });
    
    return encodedContent.storeDict(contentDict).endCell();
}

export function unpackTokenContent(packedContent: Cell, fields: [string]): UnpackedContentResult {
    const packedContentSlice = packedContent.beginParse();
    packedContentSlice.skip(8);
    const contentDict = packedContentSlice.loadDict(
        Dictionary.Keys.Buffer(32),
        Dictionary.Values.Cell()
    );

    const content: TokenContent = {};
    let fieldContent;
    fields.forEach((key) => {
        fieldContent = contentDict.get(sha256_sync(key));
        if (!fieldContent) throw new Error(`Field ${key} does not exist in content dict`);
        fieldContent = fieldContent.beginParse();
        fieldContent.skip(8);
        content[key] = fieldContent.loadStringTail();
        contentDict.delete(sha256_sync(key));
    });

    return {
        content,
        remainder: contentDict,
        isRemainderEmpty: contentDict.size == 0
    }
}
