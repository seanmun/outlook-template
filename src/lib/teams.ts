/**
 * Team spaces: a shared Library for a company, next to each person's own.
 *
 * The switch for the whole feature. It needs two things in place, both done on 2026-11-13:
 * (1) Organizations enabled in the Clerk instance the site uses, with membership OPTIONAL (Clerk
 * turns "membership required" on by default, which would take away everyone's personal Library),
 * and (2) the team-spaces database migration. With the switch off, nobody sees a team switcher
 * and every request works on the signed-in person's own Library.
 */
export const TEAMS_ENABLED = true;
