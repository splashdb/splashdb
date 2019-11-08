import { Database } from 'node-level'
import { query, insert, update, symbolId, remove } from '../db'
import { createDir, cleanup } from '../../fixtures/dbpath'

jest.setTimeout(60000 * 10)

const dbpath = createDir()
afterAll(() => {
  cleanup(dbpath)
})

cleanup(dbpath)

test('db', async done => {
  const db = new Database(dbpath)

  await insert(db, 'users', {
    name: '赞赏',
    age: 18,
  })

  await insert(db, 'users', {
    name: '哈哈',
    age: 18,
  })

  // console.time('time')
  const results = await query(db, {
    table: 'users',
    where: {
      type: 'string',
      operator: 'AND',
      left: 'age',
      right: 18,
    },
    limit: 1,
  })
  // console.timeEnd('time')
  // console.log(results)
  expect(results[0].age).toEqual(18)

  const id = results[0][symbolId]

  await update(db, 'users', id, {
    age: 19,
  })

  const results2 = await query(db, {
    table: 'users',
    where: {
      type: 'string',
      operator: 'AND',
      left: 'age',
      right: 19,
    },
    limit: 1,
  })

  expect(results2[0].age).toEqual(19)

  await remove(db, 'users', id)

  const results3 = await query(db, {
    table: 'users',
    where: {
      type: 'string',
      operator: 'AND',
      left: 'age',
      right: 19,
    },
    limit: 1,
  })

  expect(results3.length).toEqual(0)

  done()
})
