import json
from pathlib import Path

import numpy as np
import pulp


def solve_scenario(scenario: dict) -> dict:
    units = scenario['units']
    calls = scenario['calls']
    cost_matrix = scenario.get('cost_matrix', [])
    mode = scenario.get('mode', 'weighted')
    if not cost_matrix:
        raise ValueError('cost_matrix is required')

    prob = pulp.LpProblem('aura_dispatch', pulp.LpMinimize)
    x = {}
    for i, unit in enumerate(units):
        for j, call in enumerate(calls):
            x[(i, j)] = pulp.LpVariable(f'x_{i}_{j}', lowBound=0, upBound=1, cat='Binary')
    u = {}
    for j, call in enumerate(calls):
        u[j] = pulp.LpVariable(f'u_{j}', lowBound=0, upBound=1, cat='Binary')

    objective = []
    for i, unit in enumerate(units):
        for j, call in enumerate(calls):
            objective.append(cost_matrix[i][j] * x[(i, j)])
    for j, call in enumerate(calls):
        objective.append(call.get('weight', 1) * (scenario.get('unserved_min', 60)) * u[j])

    prob += pulp.lpSum(objective)

    for j, call in enumerate(calls):
        prob += pulp.lpSum(x[(i, j)] for i in range(len(units))) + u[j] == 1
    for i, unit in enumerate(units):
        prob += pulp.lpSum(x[(i, j)] for j in range(len(calls))) <= 1

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    assignments = []
    for i, unit in enumerate(units):
        for j, call in enumerate(calls):
            if pulp.value(x[(i, j)]) and pulp.value(x[(i, j)]) > 0.5:
                assignments.append({'unit': unit['id'], 'call': call['id'], 'cost': float(cost_matrix[i][j])})
    return {
        'objective': float(pulp.value(prob.objective)),
        'assignments': assignments,
    }


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    fixture_path = root / 'tests' / 'fixtures' / 'parity.json'
    expected_path = root / 'tests' / 'fixtures' / 'parity.expected.json'
    if not fixture_path.exists():
        raise FileNotFoundError(f'Fixture not found: {fixture_path}')
    payload = json.loads(fixture_path.read_text(encoding='utf-8'))
    results = []
    for scenario in payload['scenarios']:
        results.append(solve_scenario(scenario))
    expected_path.write_text(json.dumps({'scenarios': results}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
