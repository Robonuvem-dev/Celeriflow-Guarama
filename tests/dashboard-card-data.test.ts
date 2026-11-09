import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allDashboardModules } from '../src/app/app-domain/dashboard/dashboard-modules';
import { dashboardCardData } from '../src/app/app-domain/dashboard/dashboard-card-data';

test('todos os cartões atravessam a fronteira RSC sem funções e conservam acesso, busca e navegação', () => {
  assert.ok(allDashboardModules.length > 20);
  for (const blocked of [true, false]) {
    const cards = allDashboardModules.map(item => dashboardCardData(item, blocked));
    assert.deepEqual(structuredClone(cards), cards);
    assert.deepEqual(JSON.parse(JSON.stringify(cards)), cards);
    for (let index = 0; index < cards.length; index++) {
      const card = cards[index], original = allDashboardModules[index];
      assert.equal(card.code, original.code);
      assert.equal(card.href, original.href);
      assert.equal(card.accessCode, original.accessCode);
      assert.equal(card.isBlocked, blocked);
      assert.deepEqual(card.features, original.features);
      assert.deepEqual(card.keywords, original.keywords);
      assert.ok(!('icon' in card));
      assert.ok(original.icon);
    }
  }
});
