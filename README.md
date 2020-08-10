# splashdb


## Development

### 1. Bootstrap

```
npx lerna bootstrap
```

### 2. Build
```
npx lerna run build
```

### 3. Start services

```
cd packages/storage-node && npm start
cd packages/mongo-node && npm start
```