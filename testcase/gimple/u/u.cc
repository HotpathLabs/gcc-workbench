#include <utility>
#include <stdexcept>
template <typename... A> int sum (A&&... a) { return (0 + ... + a); }
struct R { int v; R (int x) : v (x) {} ~R () { v = 0; } };
int lam (int k)
{
  auto f = [k] (int y) { return k * y; };
  return f (3);
}
int pack (int a, int b) { return sum (a, b, 3); }
int raii (int x)
{
  R r (x);
  if (x < 0) throw std::runtime_error ("neg");
  return r.v;
}
int tryf (int x)
{
  try { return raii (x); }
  catch (const std::runtime_error &e) { return -1; }
  catch (...) { return -2; }
}
namespace { int anon (int z) { return z + 1; } }
int callanon (int z) { return anon (z); }
struct Op { int operator() (int a) const { return a + 1; } bool operator< (const Op &) const { return false; } };
int useop (int a) { Op o; return o (a) + (o < o); }
