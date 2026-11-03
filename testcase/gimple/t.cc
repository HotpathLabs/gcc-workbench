#include <vector>
template <typename T> T add (T a, T b) { return a + b; }
namespace ns { struct K { int v; int get () const { return v * 2; } }; }
int use (std::vector<int> &v, int x)
{
  ns::K k{x};
  int r = add<int> (k.get (), 1);
  try { v.push_back (r); } catch (...) { return -1; }
  return r + (int) v.size ();
}
