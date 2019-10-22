import random from './random'

export default function main(name: string): number {
  return (random() + name).length
}
