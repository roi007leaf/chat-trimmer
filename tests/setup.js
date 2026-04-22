global.foundry = {
  utils: {
    randomID: () => "random-id",
  },
};

global.CONST = {
  CHAT_MESSAGE_STYLES: {
    IC: 1,
    EMOTE: 2,
    OOC: 3,
    OTHER: 4,
  },
  CHAT_MESSAGE_TYPES: {
    IC: 1,
    EMOTE: 2,
    OOC: 3,
    OTHER: 4,
  },
};

global.game = {
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`,
  },
  settings: {
    get: jest.fn(() => 0),
    set: jest.fn(),
  },
  actors: {
    getName: jest.fn(() => null),
    get: jest.fn(() => null),
  },
  combats: [],
  combat: null,
  modules: new Map(),
  messages: {
    contents: [],
    size: 0,
  },
  user: {
    isGM: true,
  },
  world: {
    id: "test-world",
  },
};

global.ui = {
  notifications: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  chat: {},
};

global.canvas = {
  scene: { id: "scene-1" },
  tokens: {
    controlled: [],
    get: jest.fn(() => null),
    placeables: [],
  },
};

global.fromUuid = jest.fn();
global.fromUuidSync = jest.fn();
global.getDocumentClass = jest.fn();
global.ChatMessage = {
  deleteDocuments: jest.fn(),
};
