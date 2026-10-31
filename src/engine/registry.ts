import type { AbilityDefinition, RoleDefinition, RuleModule, TeamDefinition, WinCondition } from './definitions';
import { GameError } from './errors';
import type { AbilityId, DeathCause, RoleId, TeamId } from './types';
import { CORE_RULES } from './win';

function invalid(message: string): never {
  throw new GameError('INVALID_DEFINITION', message);
}

/**
 * Role Registry: Katalog aller Rollen, Fähigkeiten, Teams, Siegbedingungen und
 * Regelmodule. Die Engine kennt keine konkreten Rollen, sie arbeitet nur mit
 * den hier registrierten Definitionen.
 */
export class Registry {
  private readonly roles = new Map<RoleId, RoleDefinition>();
  private readonly abilities = new Map<AbilityId, AbilityDefinition>();
  private readonly teams = new Map<TeamId, TeamDefinition>();
  private readonly ruleModules: RuleModule[] = [];
  private readonly causeLabels = new Map<DeathCause, string>();
  private readonly ruleAbilityIds = new Set<AbilityId>();

  constructor(options: { withCoreRules?: boolean } = {}) {
    if (options.withCoreRules !== false) this.registerRule(CORE_RULES);
  }

  registerRole(role: RoleDefinition): this {
    if (!role.id) invalid('Rolle ohne ID.');
    if (this.roles.has(role.id)) invalid(`Rolle "${role.id}" ist bereits registriert.`);
    if (this.ruleModules.some((r) => r.id === role.id)) invalid(`ID "${role.id}" ist bereits als Regel vergeben.`);
    for (const ability of role.abilities ?? []) this.registerAbility(ability, role.id);
    this.roles.set(role.id, role);
    this.addCauseLabels(role.deathCauses);
    for (const rule of role.rules ?? []) {
      if (!this.ruleModules.includes(rule)) this.registerRule(rule);
    }
    return this;
  }

  registerRule(rule: RuleModule): this {
    if (!rule.id) invalid('Regelmodul ohne ID.');
    if (this.ruleModules.some((r) => r.id === rule.id) || this.roles.has(rule.id)) {
      invalid(`Regel "${rule.id}" ist bereits registriert.`);
    }
    for (const team of rule.teams ?? []) {
      if (this.teams.has(team.id)) invalid(`Team "${team.id}" ist bereits registriert.`);
      this.teams.set(team.id, team);
    }
    this.addCauseLabels(rule.deathCauses);
    for (const ability of rule.abilities ?? []) {
      this.registerAbility(ability, rule.id);
      this.ruleAbilityIds.add(ability.id);
    }
    this.ruleModules.push(rule);
    return this;
  }

  private registerAbility(ability: AbilityDefinition, roleId: RoleId): void {
    const existing = this.abilities.get(ability.id);
    if (existing && existing !== ability) {
      invalid(`Fähigkeit "${ability.id}" (Rolle "${roleId}") ist bereits mit einer anderen Definition registriert.`);
    }
    const input = ability.input;
    if (input.kind === 'players' && (input.min < 1 || input.max < input.min)) {
      invalid(`Fähigkeit "${ability.id}": ungültige Zielanzahl.`);
    }
    if (ability.group && (ability.trigger !== 'night' || ability.optional)) {
      invalid(`Fähigkeit "${ability.id}": Gruppenentscheidungen müssen Nachtfähigkeiten und verpflichtend sein.`);
    }
    if (ability.group && input.kind !== 'players') {
      invalid(`Fähigkeit "${ability.id}": Gruppenentscheidungen brauchen Spielerziele.`);
    }
    this.abilities.set(ability.id, ability);
  }

  private addCauseLabels(labels: Record<DeathCause, string> | undefined): void {
    for (const [cause, label] of Object.entries(labels ?? {})) this.causeLabels.set(cause, label);
  }

  // ---------------------------------------------------------------- Abfragen

  hasRole(id: RoleId): boolean {
    return this.roles.has(id);
  }

  getRole(id: RoleId): RoleDefinition {
    const role = this.roles.get(id);
    if (!role) throw new GameError('UNKNOWN_ROLE', `Die Rolle "${id}" existiert nicht im Rollenkatalog.`);
    return role;
  }

  listRoles(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  getAbility(id: AbilityId): AbilityDefinition {
    const ability = this.abilities.get(id);
    if (!ability) throw new GameError('UNKNOWN_ABILITY', `Unbekannte Fähigkeit "${id}".`);
    return ability;
  }

  nightAbilities(): AbilityDefinition[] {
    return [...this.abilities.values()].filter((a) => a.trigger === 'night');
  }

  /** Fähigkeit eines Regelmoduls (nicht an eine Rolle gebunden). */
  isRuleAbility(abilityId: AbilityId): boolean {
    return this.ruleAbilityIds.has(abilityId);
  }

  ruleAbilities(): AbilityDefinition[] {
    return [...this.ruleAbilityIds].map((id) => this.getAbility(id));
  }

  roleHasAbility(roleId: RoleId, abilityId: AbilityId): boolean {
    return this.roles.get(roleId)?.abilities?.some((a) => a.id === abilityId) ?? false;
  }

  getTeam(id: TeamId): TeamDefinition | undefined {
    return this.teams.get(id);
  }

  get rules(): readonly RuleModule[] {
    return this.ruleModules;
  }

  winConditions(): WinCondition[] {
    return this.ruleModules
      .flatMap((r) => r.winConditions ?? [])
      .map((condition, index) => ({ condition, index }))
      .sort((a, b) => a.condition.priority - b.condition.priority || a.index - b.index)
      .map((e) => e.condition);
  }

  causeLabel(cause: DeathCause): string {
    return this.causeLabels.get(cause) ?? cause;
  }

  /** Standardoptionen einer Rolle oder eines Regelmoduls. */
  defaultOptions(ownerId: string): Record<string, unknown> {
    return { ...(this.roles.get(ownerId)?.defaultOptions ?? this.ruleModules.find((r) => r.id === ownerId)?.defaultOptions ?? {}) };
  }

  isOptionsOwner(id: string): boolean {
    return this.roles.has(id) || this.ruleModules.some((r) => r.id === id);
  }
}
