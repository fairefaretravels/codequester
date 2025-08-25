public class ColorZone : MonoBehaviour
{
    public BoostColor color;
    void OnTriggerEnter(Collider other)
    {
        if (other.TryGetComponent(out CarController car))
            car.ApplyColorBoost(color);
    }
}
