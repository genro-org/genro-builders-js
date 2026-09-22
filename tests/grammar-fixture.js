export const declaration = (overrides = {}) => ({
    doc: null,
    sub_tags: null,
    parent_tags: null,
    inherits_from: null,
    ns: null,
    attributes: null,
    node_label: null,
    collection_key: null,
    _meta: null,
    ...overrides,
});

export const abstractDeclaration = (overrides = {}) => {
    const value = declaration(overrides);
    delete value.node_label;
    delete value.collection_key;
    return value;
};

export const grammarDocument = (name, elements = {}, abstracts = {}) => ({
    document_format: { name: 'builder_grammar', version: '1.1' },
    grammar: { name, version: null, title: null, description: null },
    abstracts,
    elements,
});
