//! Shared atomic state — re-exports from callback module.
//!
//! All shared state is now in `callback::SharedAtomics` which uses only
//! atomic types (no mutexes). The audio callback writes, other threads read.
