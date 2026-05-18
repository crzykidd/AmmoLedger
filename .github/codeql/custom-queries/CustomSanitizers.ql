/**
 * @name AmmoLedger custom sanitizer registration
 * @description Empty query whose sole purpose is to import the
 *   AmmoLedgerSanitizers library. CodeQL processes sanitizer
 *   classes when they're loaded via a query in the active pack.
 *   This query selects nothing.
 * @kind problem
 * @problem.severity warning
 * @precision very-low
 * @id ammoledger/custom-sanitizer-registration
 * @tags maintainability
 */

import python
import AmmoLedgerSanitizers

from File f
where none()
select f, "(never matches)"
